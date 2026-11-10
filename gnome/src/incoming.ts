import type { AppInfo, ImageInfo, Incoming } from '@leike/core';

/** Password managers offer this mime type. Leike never reads such a change. */
export const passwordMimeType = 'x-kde-passwordManagerHint';

export type ClipboardRead = { kind: 'image'; mime: 'image/png' } | { kind: 'text'; mime: string } | { kind: 'skip'; reason: string };

// text/uri-list comes before text/plain, because a file manager offers both
// and only the uri-list gives file:// URIs, which the core classifies as file.
const textMimeTypes = ['text/uri-list', 'text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain', 'STRING', 'TEXT'];

/**
 * Selects what the watcher reads from the offered mime types. The order of
 * the list does not matter.
 *
 * image/png is not always an image copy. A spreadsheet or a document offers
 * its text as HTML and as plain text, and a picture of that text as
 * image/png: there the text is the content. An image copy does not have
 * both text forms: a browser offers HTML and no plain text, and an image
 * viewer offers the file path as plain text and no HTML.
 */
export function chooseRead(mimeTypes: readonly string[]): ClipboardRead {
  if (mimeTypes.includes(passwordMimeType)) {
    return { kind: 'skip', reason: 'password' };
  }
  const textMime = textMimeTypes.find((type) => mimeTypes.includes(type));
  const isPictureOfText = textMime !== undefined && mimeTypes.includes('text/html');
  if (mimeTypes.includes('image/png') && !isPictureOfText) {
    return { kind: 'image', mime: 'image/png' };
  }
  return textMime === undefined ? { kind: 'skip', reason: 'no-supported-type' } : { kind: 'text', mime: textMime };
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the width and height from the IHDR chunk. Gives null for data that is not a PNG. */
export function pngSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.length < 24 || pngSignature.some((byte, index) => data[index] !== byte)) {
    return null;
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(12) !== 0x49484452) {
    return null;
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Gives time-ordered ids such as 1793900000000-0. Ids made in the same
 * millisecond get a higher counter. An id is also an image file name.
 */
export function idGenerator(): (now: number) => string {
  let lastNow = -1;
  let counter = 0;
  return (now) => {
    counter = now === lastNow ? counter + 1 : 0;
    lastNow = now;
    return `${now}-${counter}`;
  };
}

/** True for an id that is safe as a file name in the images directory. */
export function isSafeId(id: string): boolean {
  return /^[0-9A-Za-z_-]+$/.test(id);
}

export function textIncoming(id: string, text: string, hash: string, now: number, app?: AppInfo): Incoming {
  return withApp({ id, text, hash, now }, app);
}

export function imageIncoming(id: string, image: ImageInfo, hash: string, now: number, app?: AppInfo): Incoming {
  return withApp({ id, image, hash, now }, app);
}

function withApp(incoming: Incoming, app: AppInfo | undefined): Incoming {
  return app === undefined ? incoming : { ...incoming, app };
}

/** Gives the app of the focused window. A window with no WM_CLASS gives no app. */
export function appInfo(wmClass: string | null, appName: string | null, title: string | null): AppInfo | undefined {
  if (wmClass === null || wmClass === '') {
    return undefined;
  }
  return { name: appName || title || wmClass, wmClass };
}

export function isBlockedWmClass(wmClass: string | null, blocklist: readonly string[]): boolean {
  if (wmClass === null) {
    return false;
  }
  const wanted = wmClass.toLowerCase();
  return blocklist.some((blocked) => blocked.toLowerCase() === wanted);
}
