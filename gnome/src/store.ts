import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
  addEntry,
  emptyHistory,
  parseHistory,
  pruneHistory,
  removeEntry,
  serializeHistory,
  togglePinned,
  touchEntry,
  type History,
  type HistoryChange,
  type Incoming,
  type Settings,
} from '@leike/core';
import { brokenHistoryFile, dataDir, historyFile, imageFile, imagesDir } from './data-paths.ts';
import { isSafeId } from './incoming.ts';

export interface StoreOptions {
  /** Live settings. The store calls this at each change. */
  settings: () => Settings;
  /** GLib.get_user_data_dir() by default. The store uses <userDataDir>/leike. */
  userDataDir?: string;
  saveDelayMs?: number;
  checkDelayMs?: number;
}

// PRIVATE gives mode 0600: the history can hold secrets.
const createFlags = Gio.FileCreateFlags.PRIVATE;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Keeps the history in memory and in history.json, and the image files in
 * images/<id>.png. Writes are debounced and atomic: an asynchronous write
 * goes to a temporary file, and the main loop renames it only while the
 * store is not disposed. So no write of this store lands after destroy().
 * A directory monitor reloads the history when another
 * process changes or deletes history.json, for example "Clear history" in the
 * preferences window.
 */
export class HistoryStore {
  readonly userDataDir: string;
  readonly dir: string;
  readonly historyPath: string;
  readonly imagesDir: string;
  private current: History = emptyHistory;
  private readonly settings: () => Settings;
  private readonly saveDelayMs: number;
  private readonly checkDelayMs: number;
  private readonly listeners = new Set<() => void>();
  private readonly pendingImages = new Map<string, GLib.Bytes>();
  private lastEtag: string | null = null;
  private saveSourceId = 0;
  private checkSourceId = 0;
  private writing = false;
  private saveAfterWrite = false;
  private checkAfterWrite = false;
  private monitor: Gio.FileMonitor | null = null;
  private disposed = false;

  constructor(options: StoreOptions) {
    this.settings = options.settings;
    this.userDataDir = options.userDataDir ?? GLib.get_user_data_dir();
    this.dir = dataDir(this.userDataDir);
    this.historyPath = historyFile(this.userDataDir);
    this.imagesDir = imagesDir(this.userDataDir);
    this.saveDelayMs = options.saveDelayMs ?? 200;
    this.checkDelayMs = options.checkDelayMs ?? 100;
  }

  get history(): History {
    return this.current;
  }

  /** Reads history.json, removes orphan image files and starts the directory monitor. */
  load(): void {
    GLib.mkdir_with_parents(this.imagesDir, 0o700);
    this.deleteFiles(childNames(this.dir).filter((name) => name.startsWith('history.json.') && name.endsWith('.tmp')).map((name) => GLib.build_filenamev([this.dir, name])));
    this.current = this.readHistoryFile();
    this.reconcileImages();
    this.monitor = Gio.File.new_for_path(this.dir).monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
    this.monitor.connect('changed', (_monitor, file, otherFile) => {
      if (file.get_basename() === 'history.json' || otherFile?.get_basename() === 'history.json') {
        this.scheduleCheck();
      }
    });
  }

  /** Calls the callback after each change of the history. Gives a function that disconnects it. */
  onChanged(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /** Adds a clipboard change. imageData is the PNG data of an image change. */
  addIncoming(incoming: Incoming, imageData?: GLib.Bytes): HistoryChange {
    const change = addEntry(this.current, incoming, this.settings());
    if (change.rejected !== undefined) {
      console.log(`Leike: did not keep a clipboard change: ${change.rejected}`);
      return change;
    }
    this.apply(change);
    if (imageData !== undefined && change.history.entries.some((entry) => entry.id === incoming.id)) {
      this.writeImage(incoming.id, imageData);
    }
    return change;
  }

  remove(id: string): void {
    this.apply(removeEntry(this.current, id));
  }

  touch(id: string): void {
    this.apply({ history: touchEntry(this.current, id, Date.now()), deletedImageIds: [] });
  }

  togglePinned(id: string): void {
    this.apply({ history: togglePinned(this.current, id), deletedImageIds: [] });
  }

  /** Removes all entries, also the pinned entries. */
  clear(): void {
    const imageIds = this.current.entries.filter((entry) => entry.type === 'image').map((entry) => entry.id);
    this.apply({ history: emptyHistory, deletedImageIds: imageIds });
  }

  /** Applies a lower max-entries setting. */
  prune(): void {
    this.apply(pruneHistory(this.current, this.settings()));
  }

  imagePath(id: string): string {
    if (!isSafeId(id)) {
      throw new Error(`unsafe entry id ${JSON.stringify(id)}`);
    }
    return imageFile(this.userDataDir, id);
  }

  /** Gives the PNG data of an image entry, or null when the file is missing. */
  readImage(id: string): GLib.Bytes | null {
    try {
      const [, contents] = Gio.File.new_for_path(this.imagePath(id)).load_contents(null);
      return new GLib.Bytes(contents);
    } catch (error) {
      console.warn(`Leike: cannot read image ${id}: ${String(error)}`);
      return null;
    }
  }

  /** Writes the pending changes synchronously. After this, the callbacks of writes in flight do nothing. */
  destroy(): void {
    if (this.saveSourceId !== 0 || this.writing) {
      this.cancelSave();
      this.writeSync();
    }
    for (const [id, data] of this.pendingImages) {
      if (this.hasEntry(id)) {
        this.writeFileSync(this.imagePath(id), data.toArray());
      }
    }
    this.pendingImages.clear();
    this.disposed = true;
    if (this.checkSourceId !== 0) {
      GLib.source_remove(this.checkSourceId);
      this.checkSourceId = 0;
    }
    this.monitor?.cancel();
    this.monitor = null;
    this.listeners.clear();
  }

  private apply(change: HistoryChange): void {
    if (change.history === this.current && change.deletedImageIds.length === 0) {
      return;
    }
    this.current = change.history;
    this.deleteImages(change.deletedImageIds);
    this.scheduleSave();
    this.emitChanged();
  }

  private emitChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error(`Leike: change listener failed: ${String(error)}`);
      }
    }
  }

  private readHistoryFile(): History {
    const file = Gio.File.new_for_path(this.historyPath);
    let contents: Uint8Array;
    let etag: string;
    try {
      [, contents, etag] = file.load_contents(null);
    } catch (error) {
      this.lastEtag = null;
      if (!isNotFound(error)) {
        console.error(`Leike: cannot read ${this.historyPath}: ${String(error)}`);
      }
      return emptyHistory;
    }
    try {
      const history = parseHistory(JSON.parse(decoder.decode(contents)));
      this.lastEtag = etag;
      return history;
    } catch (error) {
      this.lastEtag = null;
      const broken = brokenHistoryFile(this.userDataDir, GLib.DateTime.new_now_local().format('%Y%m%dT%H%M%S') ?? '');
      console.error(`Leike: ${this.historyPath} is not valid (${String(error)}). Moving it to ${broken}.`);
      try {
        file.move(Gio.File.new_for_path(broken), Gio.FileCopyFlags.OVERWRITE, null, null);
      } catch (moveError) {
        console.error(`Leike: cannot move ${this.historyPath}: ${String(moveError)}`);
      }
      return emptyHistory;
    }
  }

  /** Deletes image files that no entry references, and image entries that have no file. */
  private reconcileImages(): void {
    const fileIds = new Set<string>();
    for (const name of childNames(this.imagesDir)) {
      if (name.endsWith('.png')) {
        fileIds.add(name.slice(0, -'.png'.length));
      } else if (name.endsWith('.tmp') && this.pendingImages.size === 0) {
        // A write that did not complete, for example at a crash.
        this.deleteFiles([GLib.build_filenamev([this.imagesDir, name])]);
      }
    }

    const entryIds = new Set(this.current.entries.filter((entry) => entry.type === 'image').map((entry) => entry.id));
    const orphans = [...fileIds].filter((id) => !entryIds.has(id) && !this.pendingImages.has(id));
    this.deleteFiles(orphans.map((id) => imageFile(this.userDataDir, id)));

    let history = this.current;
    for (const id of entryIds) {
      if (!fileIds.has(id) && !this.pendingImages.has(id)) {
        console.warn(`Leike: image ${id} has no file, removed the entry`);
        history = removeEntry(history, id).history;
      }
    }
    if (history !== this.current) {
      this.current = history;
      this.scheduleSave();
    }
  }

  private hasEntry(id: string): boolean {
    return this.current.entries.some((entry) => entry.id === id);
  }

  private writeImage(id: string, data: GLib.Bytes): void {
    this.pendingImages.set(id, data);
    GLib.mkdir_with_parents(this.imagesDir, 0o700);
    const path = this.imagePath(id);
    const temp = tempFile(path);
    temp.replace_contents_bytes_async(data, null, false, createFlags, null, (_file, result) => {
      if (this.disposed) {
        deleteQuietly(temp);
        return;
      }
      this.pendingImages.delete(id);
      try {
        temp.replace_contents_finish(result);
        // The entry can go away while the file is written.
        if (this.hasEntry(id)) {
          temp.move(Gio.File.new_for_path(path), Gio.FileCopyFlags.OVERWRITE, null, null);
          return;
        }
      } catch (error) {
        console.error(`Leike: cannot write image ${id}: ${String(error)}`);
      }
      deleteQuietly(temp);
    });
  }

  private deleteImages(ids: readonly string[]): void {
    this.deleteFiles(ids.filter(isSafeId).map((id) => this.imagePath(id)));
  }

  private deleteFiles(paths: readonly string[]): void {
    paths.forEach((path) => deleteQuietly(Gio.File.new_for_path(path)));
  }

  private scheduleSave(): void {
    if (this.saveSourceId !== 0 || this.disposed) {
      return;
    }
    this.saveSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.saveDelayMs, () => {
      this.saveSourceId = 0;
      this.writeAsync();
      return GLib.SOURCE_REMOVE;
    });
  }

  private cancelSave(): void {
    if (this.saveSourceId !== 0) {
      GLib.source_remove(this.saveSourceId);
      this.saveSourceId = 0;
    }
    this.saveAfterWrite = false;
  }

  private contents(): Uint8Array {
    return encoder.encode(`${JSON.stringify(serializeHistory(this.current))}\n`);
  }

  private writeFileSync(path: string, contents: Uint8Array): void {
    const temp = tempFile(path);
    try {
      temp.replace_contents(contents, null, false, createFlags, null);
      temp.move(Gio.File.new_for_path(path), Gio.FileCopyFlags.OVERWRITE, null, null);
    } catch (error) {
      console.error(`Leike: cannot write ${path}: ${String(error)}`);
      deleteQuietly(temp);
    }
  }

  private writeSync(): void {
    GLib.mkdir_with_parents(this.dir, 0o700);
    this.writeFileSync(this.historyPath, this.contents());
    this.lastEtag = this.historyEtag();
  }

  private historyEtag(): string | null {
    try {
      return Gio.File.new_for_path(this.historyPath).query_info('etag::value', Gio.FileQueryInfoFlags.NONE, null).get_etag();
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private writeAsync(): void {
    if (this.writing) {
      this.saveAfterWrite = true;
      return;
    }
    this.writing = true;
    GLib.mkdir_with_parents(this.dir, 0o700);
    const temp = tempFile(this.historyPath);
    temp.replace_contents_bytes_async(new GLib.Bytes(this.contents()), null, false, createFlags, null, (_file, result) => {
      if (this.disposed) {
        deleteQuietly(temp);
        return;
      }
      this.writing = false;
      try {
        temp.replace_contents_finish(result);
        temp.move(Gio.File.new_for_path(this.historyPath), Gio.FileCopyFlags.OVERWRITE, null, null);
        this.lastEtag = this.historyEtag();
      } catch (error) {
        console.error(`Leike: cannot write ${this.historyPath}: ${String(error)}`);
        deleteQuietly(temp);
      }
      if (this.saveAfterWrite) {
        this.saveAfterWrite = false;
        this.writeAsync();
      } else if (this.checkAfterWrite) {
        this.checkAfterWrite = false;
        this.checkExternalChange();
      }
    });
  }

  private scheduleCheck(): void {
    if (this.checkSourceId !== 0 || this.disposed) {
      return;
    }
    this.checkSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.checkDelayMs, () => {
      this.checkSourceId = 0;
      if (this.writing) {
        this.checkAfterWrite = true;
      } else {
        this.checkExternalChange();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  /** Reloads when history.json is not the file that the store wrote last. */
  private checkExternalChange(): void {
    const etag = this.historyEtag();
    if (etag === this.lastEtag) {
      return;
    }
    console.log(`Leike: history.json was ${etag === null ? 'deleted' : 'changed'} by another process, reloaded it`);
    this.cancelSave();
    GLib.mkdir_with_parents(this.imagesDir, 0o700);
    this.current = this.readHistoryFile();
    this.reconcileImages();
    this.emitChanged();
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND);
}

function deleteQuietly(file: Gio.File): void {
  try {
    file.delete(null);
  } catch (error) {
    if (!isNotFound(error)) {
      console.warn(`Leike: cannot delete ${file.get_path()}: ${String(error)}`);
    }
  }
}

/** A new file name next to the path, so a rename replaces the path atomically. */
function tempFile(path: string): Gio.File {
  return Gio.File.new_for_path(`${path}.${GLib.uuid_string_random()}.tmp`);
}

function childNames(path: string): string[] {
  const names: string[] = [];
  const enumerator = Gio.File.new_for_path(path).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
    names.push(info.get_name());
  }
  enumerator.close(null);
  return names;
}
