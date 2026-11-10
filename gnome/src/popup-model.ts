import { dayKeyInTimeZone, dayLabel, entryTypes, filterEntries, groupByDay, type DayKey, type Entry, type EntryType } from '@leike/core';

/** The pure state and text of the history popup. No GNOME imports, so node tests can run it. */

/** null is "All". */
export type TypeFilter = EntryType | null;

export const pageStep = 10;
/** The list builds rows in chunks of this size, and the next chunk when the user scrolls or moves near the end. */
export const renderChunk = 100;
/** The preview shows at most this number of characters. */
export const previewLimit = 10000;
const titleLimit = 200;
/** rowTitle looks for the first line in this many characters, so a large text does not slow down the list. */
const titleScanLimit = 4096;

const typeLabels: Record<EntryType, string> = { text: 'Text', link: 'Link', color: 'Color', file: 'File', image: 'Image' };

export function typeFilterLabel(type: TypeFilter): string {
  return type === null ? 'All' : typeLabels[type];
}

/** All, then the entry types in the core order, then All again. back goes the other way. */
export function nextTypeFilter(type: TypeFilter, back = false): TypeFilter {
  const cycle: TypeFilter[] = [null, ...entryTypes];
  const step = back ? cycle.length - 1 : 1;
  return cycle[(cycle.indexOf(type) + step) % cycle.length] ?? null;
}

export type PopupCommand = 'up' | 'down' | 'page-up' | 'page-down' | 'copy' | 'paste' | 'remove' | 'toggle-pin' | 'next-type' | 'previous-type' | 'close';

export interface KeyModifiers {
  shift: boolean;
  ctrl: boolean;
}

const plainKeys: Record<string, PopupCommand> = {
  Up: 'up',
  KP_Up: 'up',
  Down: 'down',
  KP_Down: 'down',
  Page_Up: 'page-up',
  KP_Page_Up: 'page-up',
  Page_Down: 'page-down',
  KP_Page_Down: 'page-down',
  Tab: 'next-type',
  ISO_Left_Tab: 'previous-type',
  Escape: 'close',
};

const enterKeys = new Set(['Return', 'KP_Enter', 'ISO_Enter']);
const deleteKeys = new Set(['Delete', 'KP_Delete']);

/**
 * Gives the popup command for a key name (Clutter.keyval_name), or null for
 * a key that the search entry handles. Delete removes an entry only when
 * searchCursorAtEnd is true; else it deletes text in the search entry.
 */
export function commandForKey(key: string, mods: KeyModifiers, searchCursorAtEnd = false): PopupCommand | null {
  if (enterKeys.has(key)) {
    return mods.shift ? 'paste' : 'copy';
  }
  if (mods.ctrl) {
    return key.toLowerCase() === 'p' ? 'toggle-pin' : null;
  }
  if (deleteKeys.has(key)) {
    return searchCursorAtEnd ? 'remove' : null;
  }
  return plainKeys[key] ?? null;
}

/** The filtered list and the selection. The selection is an index into visible. */
export class PopupModel {
  query = '';
  type: TypeFilter = null;
  visible: Entry[] = [];
  selected = -1;
  /** The number of visible entries that the list shows rows for. */
  renderLimit = renderChunk;
  private all: readonly Entry[];

  constructor(entries: readonly Entry[]) {
    this.all = entries;
    this.refilter();
  }

  get selectedEntry(): Entry | null {
    return this.visible[this.selected] ?? null;
  }

  get rendered(): Entry[] {
    return this.visible.slice(0, this.renderLimit);
  }

  /** For a history change while the popup is open. The selected entry stays selected, or the position stays. */
  setEntries(entries: readonly Entry[]): void {
    const id = this.selectedEntry?.id;
    const position = this.selected;
    this.all = entries;
    this.visible = filterEntries(this.all, this.query, this.type);
    const index = this.visible.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      this.selected = index;
    } else {
      this.selected = this.visible.length > 0 ? Math.max(0, Math.min(position, this.visible.length - 1)) : -1;
    }
    this.renderToInclude(this.selected);
  }

  setQuery(query: string): void {
    this.query = query;
    this.refilter();
  }

  cycleType(back = false): void {
    this.type = nextTypeFilter(this.type, back);
    this.refilter();
  }

  move(delta: number): void {
    if (this.visible.length === 0) {
      return;
    }
    this.select(Math.max(0, Math.min(this.visible.length - 1, this.selected + delta)));
  }

  select(index: number): void {
    if (index >= 0 && index < this.visible.length) {
      this.selected = index;
      this.renderToInclude(index);
    }
  }

  /** Renders one more chunk. Gives false when all visible entries have rows already. */
  extend(): boolean {
    if (this.renderLimit >= this.visible.length) {
      return false;
    }
    this.renderLimit += renderChunk;
    return true;
  }

  private renderToInclude(index: number): void {
    this.renderLimit = Math.max(this.renderLimit, Math.ceil((index + 1) / renderChunk) * renderChunk);
  }

  private refilter(): void {
    this.visible = filterEntries(this.all, this.query, this.type);
    this.selected = this.visible.length > 0 ? 0 : -1;
    this.renderLimit = renderChunk;
  }
}

export type ListItem = { kind: 'header'; label: string } | { kind: 'entry'; entry: Entry; index: number };

/**
 * The list rows for entries[from, to) with a day header before each day. A
 * slice that continues the day of entries[from - 1] gets no header.
 */
export function listItems(entries: readonly Entry[], from: number, to: number, dayKey: DayKey, todayKey: string): ListItem[] {
  const previous = entries[from - 1];
  const previousDay = previous === undefined ? null : dayKey(previous.createdAt);
  const items: ListItem[] = [];
  let index = from;
  for (const group of groupByDay(entries.slice(from, to), dayKey)) {
    if (group.day !== previousDay || index !== from) {
      items.push({ kind: 'header', label: dayLabel(group.day, todayKey) });
    }
    for (const entry of group.entries) {
      items.push({ kind: 'entry', entry, index });
      index += 1;
    }
  }
  return items;
}

function fileUris(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function uriToPath(uri: string): string {
  const path = uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function baseName(path: string): string {
  const parts = path.split('/').filter((part) => part !== '');
  return parts[parts.length - 1] ?? path;
}

/** The one-line text of a list row. St ellipsizes it, so it is only cut to keep the label small. */
export function rowTitle(entry: Entry): string {
  if (entry.type === 'image') {
    return `Image ${entry.image?.width ?? 0} × ${entry.image?.height ?? 0}`;
  }
  const text = entry.text ?? '';
  if (entry.type === 'file') {
    const uris = fileUris(text);
    const first = baseName(uriToPath(uris[0] ?? ''));
    return uris.length > 1 ? `${first} and ${uris.length - 1} more` : first;
  }
  const line = text.slice(0, titleScanLimit).split('\n').find((item) => item.trim() !== '') ?? '';
  return line.trim().slice(0, titleLimit);
}

/** The text of the preview pane: a file list as paths, other text clamped to previewLimit characters. */
export function previewText(entry: Entry): string {
  const text = entry.text ?? '';
  if (entry.type === 'file') {
    return fileUris(text).map(uriToPath).join('\n');
  }
  if (text.length <= previewLimit) {
    return text;
  }
  return `${text.slice(0, previewLimit)}\n\n(Only the first ${previewLimit} characters are shown.)`;
}

const number = String.raw`\s*([+-]?(?:\d+\.?\d*|\.\d+))(%|deg)?\s*`;
const functionColor = new RegExp(String.raw`^(rgba?|hsla?)\(${number}[,\s]${number}[,\s]${number}(?:[,/]${number})?\)$`, 'i');

function round(value: number, places = 0): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0) * 255, channel(8) * 255, channel(4) * 255];
}

/**
 * Gives a CSS rgba() value that St can parse, for the color formats that the
 * core classifies as a color, or null.
 */
export function colorCss(text: string): string | null {
  const value = text.trim();
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    const [r, g, b] = [hex[1], hex[2], hex[3]].map((part) => parseInt(part ?? '0', 16));
    const alpha = hex[4] === undefined ? 1 : round(parseInt(hex[4], 16) / 255, 3);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const match = functionColor.exec(value);
  if (!match) {
    return null;
  }
  const amount = (index: number) => Number(match[index]);
  const isPercent = (index: number) => match[index + 1] === '%';
  const alpha = match[8] === undefined ? 1 : isPercent(8) ? amount(8) / 100 : amount(8);
  let rgb: number[];
  if (match[1]?.toLowerCase().startsWith('rgb')) {
    rgb = [2, 4, 6].map((index) => (isPercent(index) ? (amount(index) / 100) * 255 : amount(index)));
  } else {
    rgb = hslToRgb(((amount(2) % 360) + 360) % 360, amount(4) / 100, amount(6) / 100);
  }
  const [r, g, b] = rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))));
  return `rgba(${r}, ${g}, ${b}, ${round(Math.max(0, Math.min(1, alpha)), 3)})`;
}

export interface TimeFormat {
  dayKey: DayKey;
  /** 24-hour HH:MM. */
  clock: (ms: number) => string;
}

/** The day key and the clock in an IANA time zone. An unknown or missing zone gives the default zone of the runtime. */
export function timeFormat(timeZone: string | undefined): TimeFormat {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch {
    zone = undefined;
  }
  zone ??= new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return { dayKey: dayKeyInTimeZone(zone), clock: (ms) => clockFormat.format(ms) };
}

/** "Today 14:32", "Yesterday 09:01" or "2026-11-02 14:32". */
export function copiedLabel(createdAt: number, now: number, format: TimeFormat): string {
  return `${dayLabel(format.dayKey(createdAt), format.dayKey(now))} ${format.clock(createdAt)}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return plural(bytes, 'byte');
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const characterCounts = new WeakMap<Entry, number>();

/** The number of code points in the text of the entry. Entries do not change, so each entry is counted once. */
export function characterCount(entry: Entry): number {
  let count = characterCounts.get(entry);
  if (count === undefined) {
    count = 0;
    for (const _ of entry.text ?? '') {
      count += 1;
    }
    characterCounts.set(entry, count);
  }
  return count;
}

/** The rows of the Information table: [label, value]. */
export function informationRows(entry: Entry, now: number, format: TimeFormat): [string, string][] {
  const rows: [string, string][] = [
    ['Application', entry.app?.name || 'Unknown'],
    ['Content type', typeLabels[entry.type]],
  ];
  if (entry.type === 'image') {
    rows.push(['Dimensions', `${entry.image?.width ?? 0} × ${entry.image?.height ?? 0}`]);
    rows.push(['Size', formatBytes(entry.image?.bytes ?? 0)]);
  } else if (entry.type === 'file') {
    rows.push(['Size', plural(fileUris(entry.text ?? '').length, 'file')]);
  } else {
    rows.push(['Size', plural(characterCount(entry), 'character')]);
  }
  rows.push(['Copied', copiedLabel(entry.createdAt, now, format)]);
  return rows;
}

/** Scales width x height down to fit in maxWidth x maxHeight. It never scales up. */
export function fitSize(width: number, height: number, maxWidth: number, maxHeight: number): [number, number] {
  if (width <= 0 || height <= 0) {
    return [0, 0];
  }
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return [Math.round(width * scale), Math.round(height * scale)];
}

const POPUP_WIDTH = 1152;
const POPUP_HEIGHT = 840;

/**
 * The size of the history popup in stage pixels: a fixed size, so the popup
 * does not grow with the monitor. A smaller monitor limits it. `scale` is
 * the scale factor of the shell theme.
 */
export function popupSize(monitorWidth: number, monitorHeight: number, scale: number): [number, number] {
  return [Math.min(POPUP_WIDTH * scale, monitorWidth), Math.min(POPUP_HEIGHT * scale, monitorHeight)];
}
