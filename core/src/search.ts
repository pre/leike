import type { Entry, EntryType } from './types.js';

export interface DayGroup {
  /** The day key, an ISO date YYYY-MM-DD. */
  day: string;
  entries: Entry[];
}

/** Gives the day key (YYYY-MM-DD) of a time in milliseconds since the epoch. */
export type DayKey = (ms: number) => string;

/**
 * Case-insensitive substring filter on the text and the app name. An image
 * has no text, so only an empty query or its app name matches it. A null
 * type gives all types. The order stays the same.
 */
export function filterEntries(entries: readonly Entry[], query: string, type: EntryType | null): Entry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (type !== null && entry.type !== type) {
      return false;
    }
    return needle === '' || matches(entry.text, needle) || matches(entry.app?.name, needle);
  });
}

function matches(value: string | undefined, needle: string): boolean {
  return value !== undefined && value.toLowerCase().includes(needle);
}

/** Groups consecutive entries with the same day key. The entries are newest first, so the groups are too. */
export function groupByDay(entries: readonly Entry[], dayKey: DayKey): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | undefined;
  for (const entry of entries) {
    const day = dayKey(entry.createdAt);
    if (current === undefined || current.day !== day) {
      current = { day, entries: [] };
      groups.push(current);
    }
    current.entries.push(entry);
  }
  return groups;
}

/**
 * Makes a DayKey for an IANA time zone such as 'Europe/Helsinki'. The core
 * does not read the time zone of the machine; the platform gives it.
 * Throws a RangeError for an unknown time zone.
 */
export function dayKeyInTimeZone(timeZone: string): DayKey {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (ms) => {
    const parts = format.formatToParts(ms);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
}

/** Gives 'Today', 'Yesterday' or the day key itself. */
export function dayLabel(day: string, todayKey: string): string {
  if (day === todayKey) {
    return 'Today';
  }
  if (day === previousDayKey(todayKey)) {
    return 'Yesterday';
  }
  return day;
}

function previousDayKey(day: string): string {
  const oneDay = 24 * 60 * 60 * 1000;
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  return new Date(midnightUtc - oneDay).toISOString().slice(0, 10);
}
