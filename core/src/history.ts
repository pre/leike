import { classify } from './classify.js';
import type { Entry, History, HistoryChange, Incoming, Settings } from './types.js';

export const emptyHistory: History = { entries: [] };

/**
 * Adds an entry on top. An entry with the same hash moves to the top with the
 * new time and app, and keeps its id and pinned state. The platform must
 * delete the image files in deletedImageIds: a rejected image, a duplicate
 * image (the file of incoming.id) and evicted image entries.
 */
export function addEntry(history: History, incoming: Incoming, settings: Settings): HistoryChange {
  const rejected = rejectReason(incoming, settings);
  if (rejected !== undefined) {
    return { history, deletedImageIds: incomingImageIds(incoming), rejected };
  }

  const existing = history.entries.find((entry) => entry.hash === incoming.hash);
  if (existing !== undefined) {
    const moved: Entry = { ...existing, createdAt: incoming.now };
    if (incoming.app !== undefined) {
      moved.app = incoming.app;
    }
    const others = history.entries.filter((entry) => entry !== existing);
    return { history: { entries: [moved, ...others] }, deletedImageIds: incomingImageIds(incoming) };
  }

  return pruneHistory({ entries: [newEntry(incoming), ...history.entries] }, settings);
}

export function removeEntry(history: History, id: string): HistoryChange {
  const removed = history.entries.find((entry) => entry.id === id);
  if (removed === undefined) {
    return { history, deletedImageIds: [] };
  }
  return {
    history: { entries: history.entries.filter((entry) => entry !== removed) },
    deletedImageIds: imageIds([removed]),
  };
}

/** Moves an entry to the top and sets its time to now. */
export function touchEntry(history: History, id: string, now: number): History {
  const touched = history.entries.find((entry) => entry.id === id);
  if (touched === undefined) {
    return history;
  }
  const others = history.entries.filter((entry) => entry !== touched);
  return { entries: [{ ...touched, createdAt: now }, ...others] };
}

/** Pins an unpinned entry and unpins a pinned one. The entry stays in its place. */
export function togglePinned(history: History, id: string): History {
  if (!history.entries.some((entry) => entry.id === id)) {
    return history;
  }
  const entries = history.entries.map((entry) => (entry.id === id ? { ...entry, pinned: !entry.pinned } : entry));
  return { entries };
}

/**
 * Removes the oldest entries that are not pinned until there are no more than
 * settings.maxEntries entries. Pinned entries stay, also beyond the limit.
 */
export function pruneHistory(history: History, settings: Settings): HistoryChange {
  let excess = history.entries.length - settings.maxEntries;
  if (excess <= 0) {
    return { history, deletedImageIds: [] };
  }

  const evicted = new Set<Entry>();
  for (let index = history.entries.length - 1; index >= 0 && excess > 0; index--) {
    const entry = history.entries[index];
    if (entry !== undefined && !entry.pinned) {
      evicted.add(entry);
      excess--;
    }
  }

  if (evicted.size === 0) {
    return { history, deletedImageIds: [] };
  }
  const kept = history.entries.filter((entry) => !evicted.has(entry));
  const removed = history.entries.filter((entry) => evicted.has(entry));
  return { history: { entries: kept }, deletedImageIds: imageIds(removed) };
}

function rejectReason(incoming: Incoming, settings: Settings): HistoryChange['rejected'] {
  if (incoming.app !== undefined && isBlocked(incoming.app.wmClass, settings.blocklistWmClasses)) {
    return 'blocked-app';
  }
  if (incoming.image !== undefined) {
    return incoming.image.bytes > settings.maxImageBytes ? 'image-too-large' : undefined;
  }
  if (incoming.text === undefined || incoming.text.trim() === '') {
    return 'empty';
  }
  return utf8Length(incoming.text) > settings.maxTextBytes ? 'text-too-large' : undefined;
}

function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function isBlocked(wmClass: string, blocklist: readonly string[]): boolean {
  const wanted = wmClass.toLowerCase();
  return blocklist.some((blocked) => blocked.toLowerCase() === wanted);
}

function newEntry(incoming: Incoming): Entry {
  const entry: Entry = {
    id: incoming.id,
    type: 'text',
    createdAt: incoming.now,
    pinned: false,
    hash: incoming.hash,
  };
  if (incoming.image !== undefined) {
    entry.type = 'image';
    entry.image = incoming.image;
  } else if (incoming.text !== undefined) {
    entry.type = classify(incoming.text);
    entry.text = incoming.text;
  }
  if (incoming.app !== undefined) {
    entry.app = incoming.app;
  }
  return entry;
}

function incomingImageIds(incoming: Incoming): string[] {
  return incoming.image === undefined ? [] : [incoming.id];
}

function imageIds(entries: readonly Entry[]): string[] {
  return entries.filter((entry) => entry.type === 'image').map((entry) => entry.id);
}
