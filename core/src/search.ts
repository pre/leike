import type { Entry, EntryType } from './types.js';

export interface DayGroup {
  /** Local date as YYYY-MM-DD. */
  day: string;
  entries: Entry[];
}

/** Case-insensitive filter by text. A null type gives all types. */
export function filterEntries(_entries: readonly Entry[], _query: string, _type: EntryType | null): Entry[] {
  throw new Error('not implemented');
}

export function groupByDay(_entries: readonly Entry[]): DayGroup[] {
  throw new Error('not implemented');
}
