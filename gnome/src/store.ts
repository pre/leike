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
import { dataDir, historyFile, imageFile, imagesDir } from './data-paths.ts';
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
 * images/<id>.png. Writes are debounced and atomic (Gio writes a temporary
 * file and renames it). A directory monitor reloads the history when another
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
  private readonly pendingImageIds = new Set<string>();
  private lastEtag: string | null = null;
  private saveSourceId = 0;
  private checkSourceId = 0;
  private writing = false;
  private saveAfterWrite = false;
  private checkAfterWrite = false;
  private monitor: Gio.FileMonitor | null = null;
  private destroyed = false;

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

  /** Writes a pending change now. */
  flush(): void {
    if (this.saveSourceId === 0) {
      return;
    }
    GLib.source_remove(this.saveSourceId);
    this.saveSourceId = 0;
    if (this.writing) {
      // A synchronous write now could be replaced by the older asynchronous one when it completes.
      this.saveAfterWrite = true;
    } else {
      this.writeSync();
    }
  }

  destroy(): void {
    this.flush();
    this.destroyed = true;
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
      if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))) {
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
      const broken = `${this.historyPath}.broken-${GLib.DateTime.new_now_local().format('%Y%m%dT%H%M%S')}`;
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
    const enumerator = Gio.File.new_for_path(this.imagesDir).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
    for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
      const name = info.get_name();
      if (name.endsWith('.png')) {
        fileIds.add(name.slice(0, -'.png'.length));
      }
    }
    enumerator.close(null);

    const entryIds = new Set(this.current.entries.filter((entry) => entry.type === 'image').map((entry) => entry.id));
    const orphans = [...fileIds].filter((id) => !entryIds.has(id) && !this.pendingImageIds.has(id));
    this.deleteFiles(orphans.map((id) => imageFile(this.userDataDir, id)));

    let history = this.current;
    for (const id of entryIds) {
      if (!fileIds.has(id) && !this.pendingImageIds.has(id)) {
        console.warn(`Leike: image ${id} has no file, removed the entry`);
        history = removeEntry(history, id).history;
      }
    }
    if (history !== this.current) {
      this.current = history;
      this.scheduleSave();
    }
  }

  private writeImage(id: string, data: GLib.Bytes): void {
    this.pendingImageIds.add(id);
    GLib.mkdir_with_parents(this.imagesDir, 0o700);
    const file = Gio.File.new_for_path(this.imagePath(id));
    file.replace_contents_bytes_async(data, null, false, createFlags, null, (_file, result) => {
      this.pendingImageIds.delete(id);
      try {
        file.replace_contents_finish(result);
      } catch (error) {
        console.error(`Leike: cannot write image ${id}: ${String(error)}`);
        return;
      }
      // The entry can go away while the file is written.
      if (!this.current.entries.some((entry) => entry.id === id)) {
        this.deleteImages([id]);
      }
    });
  }

  private deleteImages(ids: readonly string[]): void {
    this.deleteFiles(ids.filter(isSafeId).map((id) => this.imagePath(id)));
  }

  private deleteFiles(paths: readonly string[]): void {
    for (const path of paths) {
      try {
        Gio.File.new_for_path(path).delete(null);
      } catch (error) {
        if (!(error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))) {
          console.warn(`Leike: cannot delete ${path}: ${String(error)}`);
        }
      }
    }
  }

  private scheduleSave(): void {
    if (this.saveSourceId !== 0 || this.destroyed) {
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

  private writeSync(): void {
    try {
      GLib.mkdir_with_parents(this.dir, 0o700);
      [, this.lastEtag] = Gio.File.new_for_path(this.historyPath).replace_contents(this.contents(), null, false, createFlags, null);
    } catch (error) {
      console.error(`Leike: cannot write ${this.historyPath}: ${String(error)}`);
    }
  }

  private writeAsync(): void {
    if (this.writing) {
      this.saveAfterWrite = true;
      return;
    }
    this.writing = true;
    GLib.mkdir_with_parents(this.dir, 0o700);
    const file = Gio.File.new_for_path(this.historyPath);
    file.replace_contents_bytes_async(new GLib.Bytes(this.contents()), null, false, createFlags, null, (_file, result) => {
      this.writing = false;
      try {
        [, this.lastEtag] = file.replace_contents_finish(result);
      } catch (error) {
        console.error(`Leike: cannot write ${this.historyPath}: ${String(error)}`);
      }
      if (this.saveAfterWrite) {
        this.saveAfterWrite = false;
        if (this.destroyed) {
          this.writeSync();
        } else {
          this.writeAsync();
        }
      } else if (this.checkAfterWrite && !this.destroyed) {
        this.checkAfterWrite = false;
        this.checkExternalChange();
      }
    });
  }

  private scheduleCheck(): void {
    if (this.checkSourceId !== 0 || this.destroyed) {
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
    const file = Gio.File.new_for_path(this.historyPath);
    if (!file.query_exists(null)) {
      if (this.lastEtag === null) {
        return;
      }
      console.log('Leike: history.json was deleted, cleared the history');
    } else if (file.query_info('etag::value', Gio.FileQueryInfoFlags.NONE, null).get_etag() === this.lastEtag) {
      return;
    } else {
      console.log('Leike: history.json was changed by another process, reloaded it');
    }
    this.cancelSave();
    GLib.mkdir_with_parents(this.imagesDir, 0o700);
    this.current = this.readHistoryFile();
    this.reconcileImages();
    this.emitChanged();
  }
}
