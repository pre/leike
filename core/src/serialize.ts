import { entryTypes, type AppInfo, type Entry, type EntryType, type History, type ImageInfo } from './types.js';

export const historyVersion = 1;

/** Gives the object that the platform writes to history.json. */
export function serializeHistory(history: History): unknown {
  return { version: historyVersion, entries: history.entries.map(copyEntry) };
}

/**
 * Reads the parsed history.json. Throws an Error when the value is not a
 * history object or has an unknown version. Unknown fields are ignored.
 */
export function parseHistory(value: unknown): History {
  if (!isRecord(value)) {
    throw new Error('history is not an object');
  }
  if (value.version !== historyVersion) {
    throw new Error(`unsupported history version ${String(value.version)}`);
  }
  if (!Array.isArray(value.entries)) {
    throw new Error('history entries is not a list');
  }
  // One bad entry drops only that entry, so a partly corrupt file keeps the rest of the history.
  const entries: Entry[] = [];
  for (const item of value.entries) {
    const entry = parseEntry(item);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }
  return { entries };
}

function parseEntry(value: unknown): Entry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, type, createdAt, text, image, app, pinned, hash } = value;
  if (typeof id !== 'string' || id === '' || !isEntryType(type) || !isNumber(createdAt)) {
    return undefined;
  }
  if (typeof pinned !== 'boolean' || typeof hash !== 'string') {
    return undefined;
  }

  const entry: Entry = { id, type, createdAt, pinned, hash };
  if (type === 'image') {
    const info = parseImage(image);
    if (info === undefined) {
      return undefined;
    }
    entry.image = info;
  } else {
    if (typeof text !== 'string') {
      return undefined;
    }
    entry.text = text;
  }
  if (app !== undefined) {
    const info = parseApp(app);
    if (info === undefined) {
      return undefined;
    }
    entry.app = info;
  }
  return entry;
}

function parseImage(value: unknown): ImageInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { width, height, bytes } = value;
  if (!isNumber(width) || !isNumber(height) || !isNumber(bytes)) {
    return undefined;
  }
  return { width, height, bytes };
}

function parseApp(value: unknown): AppInfo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { name, wmClass } = value;
  if (typeof name !== 'string' || typeof wmClass !== 'string') {
    return undefined;
  }
  return { name, wmClass };
}

function copyEntry(entry: Entry): Entry {
  const copy: Entry = {
    id: entry.id,
    type: entry.type,
    createdAt: entry.createdAt,
    pinned: entry.pinned,
    hash: entry.hash,
  };
  if (entry.text !== undefined) {
    copy.text = entry.text;
  }
  if (entry.image !== undefined) {
    copy.image = { ...entry.image };
  }
  if (entry.app !== undefined) {
    copy.app = { ...entry.app };
  }
  return copy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEntryType(value: unknown): value is EntryType {
  return (entryTypes as readonly unknown[]).includes(value);
}
