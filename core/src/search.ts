import type { Entry, EntryType } from './types.js';

export interface DayGroup {
  /** The day key, an ISO date YYYY-MM-DD. */
  day: string;
  entries: Entry[];
}

/** Gives the day key (YYYY-MM-DD) of a time in milliseconds since the epoch. */
export type DayKey = (ms: number) => string;

/**
 * The scattered match and the search for a word start look only at the
 * start of a text, so that a key press stays fast. The substring match looks
 * at all of the text.
 */
const scanLimit = 4096;
/** The characters of a scattered match must be in a span of at most this many characters for each query character. */
const spanPerQueryCharacter = 6;

const startBonus = 10;
const wordStartBonus = 8;
const consecutiveBonus = 5;
const gapPenalty = 3;
/** A scattered match loses one point for each this many characters before it, because the row shows only the start of a text. */
const startDistanceUnit = 8;

/** A higher tier always ranks first, so a scattered match never goes above a match that the substring search found. */
const textSubstring = 3;
const appSubstring = 2;
const textScattered = 1;

interface Query {
  needle: string;
  /** Case-insensitive, so the search does not make a lowercase copy of each large text on each key press. */
  pattern: RegExp;
}

interface Match {
  tier: number;
  score: number;
}

const wordCharacter = /[\p{L}\p{N}]/u;

/**
 * Filters by type, then by the query, case-insensitively. An empty query
 * keeps all entries in the same order. Else the result has the best match
 * first, and an equal match keeps the order (newest first): a substring of
 * the text, then a substring of the app name, then the query characters in
 * order with small gaps in the text. An image has no text, so only an empty
 * query or its app name matches it. A null type gives all types.
 */
export function filterEntries(entries: readonly Entry[], query: string, type: EntryType | null): Entry[] {
  const needle = query.trim().toLowerCase();
  const typed = entries.filter((entry) => type === null || entry.type === type);
  if (needle === '') {
    return typed;
  }
  const search: Query = { needle, pattern: new RegExp(escapeRegExp(needle), 'gi') };
  const ranked: Array<{ entry: Entry; match: Match }> = [];
  for (const entry of typed) {
    const match = matchEntry(entry, search);
    if (match !== null) {
      ranked.push({ entry, match });
    }
  }
  ranked.sort((a, b) => b.match.tier - a.match.tier || b.match.score - a.match.score);
  return ranked.map((item) => item.entry);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchEntry(entry: Entry, query: Query): Match | null {
  const textScore = entry.text === undefined ? null : substringScore(entry.text, query.pattern);
  if (textScore !== null) {
    return { tier: textSubstring, score: textScore };
  }
  const appScore = entry.app === undefined ? null : substringScore(entry.app.name, query.pattern);
  if (appScore !== null) {
    return { tier: appSubstring, score: appScore };
  }
  const scattered = entry.text === undefined ? null : scatteredScore(entry.text.slice(0, scanLimit).toLowerCase(), query.needle);
  return scattered === null ? null : { tier: textScattered, score: scattered };
}

/** The bonus of the best place of the pattern: the start, a word start, or inside a word. */
function substringScore(text: string, pattern: RegExp): number | null {
  let first: number | null = null;
  for (const { index } of text.matchAll(pattern)) {
    if (isWordStart(text, index)) {
      return positionBonus(text, index);
    }
    first ??= index;
    if (index >= scanLimit) {
      break;
    }
  }
  return first === null ? null : positionBonus(text, first);
}

/** The best score of the needle characters in order in a short span of the lowercase text, or null. */
function scatteredScore(text: string, needle: string): number | null {
  if (positionsFrom(text, needle, 0, text.length) === null) {
    return null;
  }
  const maxSpan = needle.length * spanPerQueryCharacter;
  let best: number | null = null;
  for (let start = text.indexOf(needle.charAt(0)); start >= 0; start = text.indexOf(needle.charAt(0), start + 1)) {
    const positions = positionsFrom(text, needle, start, Math.min(text.length, start + maxSpan));
    if (positions !== null) {
      best = Math.max(best ?? -Infinity, alignmentScore(text, positions) - Math.floor(start / startDistanceUnit));
    }
  }
  return best;
}

/** The first position of each needle character after the one before, from start and before limit. */
function positionsFrom(text: string, needle: string, start: number, limit: number): number[] | null {
  const positions: number[] = [];
  let from = start;
  for (let i = 0; i < needle.length; i += 1) {
    const position = indexWithin(text, needle.charAt(i), from, limit);
    if (position < 0) {
      return null;
    }
    positions.push(position);
    from = position + 1;
  }
  return positions;
}

/** indexOf that stops at limit, so that each start does not scan the rest of the text for a missing character. */
function indexWithin(text: string, character: string, from: number, limit: number): number {
  for (let index = from; index < limit; index += 1) {
    if (text[index] === character) {
      return index;
    }
  }
  return -1;
}

/** Each character of a run gets the bonus of the run start (as in fzf), so that a run at a word start beats a run inside a word. */
function alignmentScore(text: string, positions: readonly number[]): number {
  let score = 0;
  let runBonus = 0;
  let previous: number | undefined;
  for (const position of positions) {
    if (previous !== undefined && position === previous + 1) {
      score += Math.max(consecutiveBonus, runBonus);
    } else {
      runBonus = positionBonus(text, position);
      score += runBonus - (previous === undefined ? 0 : gapPenalty + position - previous - 1);
    }
    previous = position;
  }
  return score;
}

function positionBonus(text: string, index: number): number {
  if (index === 0) {
    return startBonus;
  }
  return isWordStart(text, index) ? wordStartBonus : 0;
}

function isWordStart(text: string, index: number): boolean {
  return index === 0 || !wordCharacter.test(text.charAt(index - 1));
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
