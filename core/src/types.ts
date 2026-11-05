/** The entry types, in the order that Tab cycles the type filter. */
export const entryTypes = ['text', 'link', 'color', 'file', 'image'] as const;

export type EntryType = (typeof entryTypes)[number];

export interface ImageInfo {
  width: number;
  height: number;
  bytes: number;
}

export interface AppInfo {
  name: string;
  wmClass: string;
}

export interface Entry {
  /** Time-ordered. Also the file name of the image of an image entry. */
  id: string;
  type: EntryType;
  /** Milliseconds since the epoch, the time of the last copy. */
  createdAt: number;
  /** The text of a text, link, color or file entry. A file entry holds a text/uri-list. */
  text?: string;
  image?: ImageInfo;
  app?: AppInfo;
  pinned: boolean;
  /** The dedupe key. The platform calculates it (sha256). */
  hash: string;
}

/** Newest entry first. */
export interface History {
  entries: readonly Entry[];
}

/** One clipboard change, as the platform layer gives it to the core. */
export interface Incoming {
  /** The id for a new entry. The core ignores it when the hash is already in the history. */
  id: string;
  text?: string;
  image?: ImageInfo;
  hash: string;
  app?: AppInfo;
  now: number;
}

export interface Settings {
  maxEntries: number;
  maxImageBytes: number;
  /** The largest text in UTF-8 bytes. */
  maxTextBytes: number;
  terminalWmClasses: readonly string[];
  blocklistWmClasses: readonly string[];
}

/**
 * Why addEntry did not store an incoming change:
 * - empty: no image, and no text or only whitespace
 * - image-too-large: the image is larger than Settings.maxImageBytes
 * - text-too-large: the UTF-8 text is larger than Settings.maxTextBytes
 * - blocked-app: the app is on Settings.blocklistWmClasses
 */
export type RejectReason = 'empty' | 'image-too-large' | 'text-too-large' | 'blocked-app';

/** A new history, and the images that the platform must delete from disk. */
export interface HistoryChange {
  history: History;
  deletedImageIds: string[];
  /** Set when addEntry did not store the incoming change. The history is then unchanged. */
  rejected?: RejectReason;
}
