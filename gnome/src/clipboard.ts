import GLib from 'gi://GLib';
import St from 'gi://St';
import type { Entry } from '@leike/core';
import type { HistoryStore } from './store.ts';

/**
 * Reads and writes the CLIPBOARD selection. Meta.Selection emits
 * owner-changed synchronously inside set_text and set_content, so the
 * watcher reads isOwnChange in its handler to skip the changes of Leike.
 */
export class Clipboard {
  private readonly clipboard = St.Clipboard.get_default();
  private ownChange = false;
  // Holds the data of the last image that Leike put on the clipboard, until the next image.
  private lastImage: GLib.Bytes | null = null;
  private destroyed = false;

  get isOwnChange(): boolean {
    return this.ownChange;
  }

  readText(): Promise<string | null> {
    return new Promise((resolve) => {
      this.clipboard.get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => resolve(this.destroyed ? null : text));
    });
  }

  readContent(mimeType: string): Promise<GLib.Bytes | null> {
    return new Promise((resolve) => {
      // St frees the bytes when the callback returns, and gjs does not keep a reference.
      // Using them later, after an await, crashed the shell. Copy them here.
      this.clipboard.get_content(St.ClipboardType.CLIPBOARD, mimeType, (_clipboard, bytes) => {
        const data = this.destroyed ? null : bytes?.toArray();
        resolve(data ? new GLib.Bytes(data) : null);
      });
    });
  }

  setText(text: string): void {
    this.ownChange = true;
    try {
      this.clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
    } finally {
      this.ownChange = false;
    }
  }

  setImage(png: GLib.Bytes): void {
    this.lastImage = png;
    this.ownChange = true;
    try {
      this.clipboard.set_content(St.ClipboardType.CLIPBOARD, 'image/png', png);
    } finally {
      this.ownChange = false;
    }
  }

  /** Puts an entry on the clipboard. Gives false when the image file of an image entry is missing. */
  copyEntryToClipboard(entry: Entry, store: HistoryStore): boolean {
    if (entry.type === 'image') {
      const png = store.readImage(entry.id);
      if (png === null) {
        return false;
      }
      this.setImage(png);
      return true;
    }
    this.setText(entry.text ?? '');
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.lastImage = null;
  }
}
