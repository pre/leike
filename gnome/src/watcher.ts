import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { exceedsTextLimit, type AppInfo, type Settings } from '@leike/core';
import type { Clipboard } from './clipboard.ts';
import { appInfo, chooseRead, idGenerator, imageIncoming, isBlockedWmClass, pngSize, textIncoming, type ClipboardRead } from './incoming.ts';
import type { HistoryStore } from './store.ts';

const decoder = new TextDecoder();

/**
 * Adds each CLIPBOARD change to the store. The watcher looks at the mime
 * types and the focused window first, and reads no content for a password
 * manager, a blocked app or a change that Leike made itself.
 */
export class Watcher {
  private readonly selection: Meta.Selection;
  private readonly handlerId: number;
  private readonly nextId = idGenerator();
  private destroyed = false;

  constructor(
    private readonly clipboard: Clipboard,
    private readonly store: HistoryStore,
    private readonly settings: () => Settings,
  ) {
    this.selection = global.display.get_selection();
    this.handlerId = this.selection.connect('owner-changed', (_selection, type, source) => this.onOwnerChanged(type, source));
  }

  destroy(): void {
    this.destroyed = true;
    this.selection.disconnect(this.handlerId);
  }

  private onOwnerChanged(type: Meta.SelectionType, source: Meta.SelectionSource | null): void {
    if (type !== Meta.SelectionType.SELECTION_CLIPBOARD || source === null || this.clipboard.isOwnChange) {
      return;
    }
    // The focused window is a best guess: wl-copy, for example, focuses a helper window of its own.
    const window = global.display.focus_window;
    const wmClass = window?.get_wm_class() ?? null;
    if (isBlockedWmClass(wmClass, this.settings().blocklistWmClasses)) {
      console.log(`Leike: skipped a clipboard change from the blocked app ${wmClass}`);
      return;
    }
    const read = chooseRead(source.get_mimetypes());
    if (read.kind === 'skip') {
      if (read.reason === 'password') {
        console.log('Leike: skipped a clipboard change from a password manager');
      }
      return;
    }
    const appName = window === null ? null : (Shell.WindowTracker.get_default().get_window_app(window)?.get_name() ?? null);
    const app = appInfo(wmClass, appName, window?.get_title() ?? null);
    this.read(read, app, Date.now()).catch((error: unknown) => console.error(`Leike: cannot read the clipboard: ${String(error)}`));
  }

  private async read(read: Exclude<ClipboardRead, { kind: 'skip' }>, app: AppInfo | undefined, now: number): Promise<void> {
    const id = this.nextId(now);
    if (read.kind === 'image') {
      const png = await this.clipboard.readContent(read.mime);
      if (png === null || this.destroyed) {
        return;
      }
      const size = pngSize(png.get_data() ?? new Uint8Array());
      if (size === null) {
        console.warn('Leike: the clipboard image/png data is not a PNG');
        return;
      }
      const hash = GLib.compute_checksum_for_bytes(GLib.ChecksumType.SHA256, png);
      if (hash !== null) {
        this.store.addIncoming(imageIncoming(id, { ...size, bytes: png.get_size() }, hash, now, app), png);
      }
      return;
    }

    const text = read.mime === 'text/uri-list' ? await this.readUriList() : await this.clipboard.readText();
    if (text === null || this.destroyed) {
      return;
    }
    // The store does not keep such a text, and its hash stops the shell for a text of many megabytes.
    if (exceedsTextLimit(text, this.settings())) {
      console.log('Leike: did not keep a clipboard change: text-too-large');
      return;
    }
    const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
    if (hash !== null) {
      this.store.addIncoming(textIncoming(id, text, hash, now, app));
    }
  }

  private async readUriList(): Promise<string | null> {
    const bytes = await this.clipboard.readContent('text/uri-list');
    const data = bytes?.get_data();
    return data ? decoder.decode(data) : null;
  }
}
