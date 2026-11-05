import type { History, HistoryChange, Incoming, Settings } from './types.js';

export const emptyHistory: History = { entries: [] };

/** Adds an entry on top. An entry with the same hash moves to the top. */
export function addEntry(_history: History, _incoming: Incoming, _settings: Settings): HistoryChange {
  throw new Error('not implemented');
}

export function removeEntry(_history: History, _id: string): HistoryChange {
  throw new Error('not implemented');
}

/** Moves an entry to the top and sets its time to now. */
export function touchEntry(_history: History, _id: string, _now: number): History {
  throw new Error('not implemented');
}

/** Removes the oldest entries that are not pinned until the history obeys the limits. */
export function pruneHistory(_history: History, _settings: Settings): HistoryChange {
  throw new Error('not implemented');
}
