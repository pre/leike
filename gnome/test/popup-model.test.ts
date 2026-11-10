import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Entry, EntryType } from '@leike/core';
import {
  characterCount,
  colorCss,
  commandForKey,
  copiedLabel,
  fitSize,
  formatBytes,
  informationRows,
  listItems,
  nextTypeFilter,
  PopupModel,
  popupSize,
  previewLimit,
  previewText,
  renderChunk,
  rowTitle,
  timeFormat,
  typeFilterLabel,
} from '../src/popup-model.ts';

const helsinki = timeFormat('Europe/Helsinki');
// 2026-11-05 12:32 UTC is 14:32 in Helsinki.
const now = Date.UTC(2026, 10, 5, 12, 32);
const hour = 60 * 60 * 1000;
const day = 24 * hour;

function entry(id: string, type: EntryType, fields: Partial<Entry> = {}): Entry {
  return { id, type, createdAt: now, pinned: false, hash: id, text: type === 'image' ? undefined : `text ${id}`, ...fields };
}

function entries(count: number, type: EntryType = 'text'): Entry[] {
  return Array.from({ length: count }, (_, index) => entry(`e${index}`, type, { createdAt: now - index * hour }));
}

test('nextTypeFilter cycles All, then the entry types in order, then All again', () => {
  const seen = [];
  let filter = nextTypeFilter(null);
  while (filter !== null) {
    seen.push(filter);
    filter = nextTypeFilter(filter);
  }
  assert.deepEqual(seen, ['text', 'link', 'color', 'file', 'image']);
});

test('nextTypeFilter goes back from All to the last type', () => {
  assert.equal(nextTypeFilter(null, true), 'image');
  assert.equal(nextTypeFilter('text', true), null);
  assert.equal(nextTypeFilter('link', true), 'text');
});

test('typeFilterLabel gives the English labels', () => {
  assert.deepEqual([null, 'text', 'link', 'color', 'file', 'image'].map((type) => typeFilterLabel(type as EntryType | null)), [
    'All',
    'Text',
    'Link',
    'Color',
    'File',
    'Image',
  ]);
});

test('commandForKey maps the list keys', () => {
  const none = { shift: false, ctrl: false };
  assert.equal(commandForKey('Up', none), 'up');
  assert.equal(commandForKey('KP_Down', none), 'down');
  assert.equal(commandForKey('Page_Up', none), 'page-up');
  assert.equal(commandForKey('Page_Down', none), 'page-down');
  assert.equal(commandForKey('Return', none), 'copy');
  assert.equal(commandForKey('KP_Enter', none), 'copy');
  assert.equal(commandForKey('Return', { shift: true, ctrl: false }), 'paste');
  assert.equal(commandForKey('Delete', none, true), 'remove');
  assert.equal(commandForKey('Tab', none), 'next-type');
  assert.equal(commandForKey('ISO_Left_Tab', { shift: true, ctrl: false }), 'previous-type');
  assert.equal(commandForKey('Escape', none), 'close');
  assert.equal(commandForKey('p', { shift: false, ctrl: true }), 'toggle-pin');
  assert.equal(commandForKey('P', { shift: true, ctrl: true }), 'toggle-pin');
});

test('commandForKey removes an entry with Delete only when the search cursor is at the end', () => {
  const none = { shift: false, ctrl: false };
  assert.equal(commandForKey('Delete', none, true), 'remove');
  assert.equal(commandForKey('KP_Delete', none, true), 'remove');
  assert.equal(commandForKey('Delete', none, false), null);
  assert.equal(commandForKey('KP_Delete', none, false), null);
  assert.equal(commandForKey('Delete', none), null);
});

test('commandForKey leaves text keys to the search entry', () => {
  assert.equal(commandForKey('p', { shift: false, ctrl: false }), null);
  assert.equal(commandForKey('a', { shift: false, ctrl: true }), null);
  assert.equal(commandForKey('BackSpace', { shift: false, ctrl: false }), null);
  assert.equal(commandForKey('Left', { shift: false, ctrl: false }), null);
});

test('PopupModel opens with the newest entry selected and the search empty', () => {
  const model = new PopupModel(entries(3));
  assert.equal(model.query, '');
  assert.equal(model.type, null);
  assert.equal(model.selected, 0);
  assert.equal(model.selectedEntry?.id, 'e0');
});

test('PopupModel with no entries has no selection', () => {
  const model = new PopupModel([]);
  assert.equal(model.selected, -1);
  assert.equal(model.selectedEntry, null);
  model.move(1);
  assert.equal(model.selected, -1);
});

test('PopupModel.move stops at both ends', () => {
  const model = new PopupModel(entries(5));
  model.move(-1);
  assert.equal(model.selected, 0);
  model.move(3);
  assert.equal(model.selected, 3);
  model.move(10);
  assert.equal(model.selected, 4);
});

test('PopupModel.move past the rendered rows renders more rows', () => {
  const model = new PopupModel(entries(250));
  assert.equal(model.rendered.length, renderChunk);
  model.move(renderChunk);
  assert.equal(model.selected, renderChunk);
  assert.equal(model.rendered.length, 2 * renderChunk);
});

test('PopupModel.extend renders the next chunk and tells when nothing is left', () => {
  const model = new PopupModel(entries(150));
  assert.equal(model.extend(), true);
  assert.equal(model.rendered.length, 150);
  assert.equal(model.extend(), false);
});

test('PopupModel.setQuery filters live and selects the first match', () => {
  const model = new PopupModel([entry('a', 'text', { text: 'Hello' }), entry('b', 'link', { text: 'https://x.org' }), entry('c', 'text', { text: 'help' })]);
  model.move(1);
  model.setQuery('HEL');
  assert.deepEqual(model.visible.map((item) => item.id), ['a', 'c']);
  assert.equal(model.selected, 0);
  model.setQuery('nothing');
  assert.equal(model.selected, -1);
});

test('PopupModel.cycleType filters by type and keeps the query', () => {
  const model = new PopupModel([entry('a', 'text'), entry('b', 'link'), entry('c', 'image', { app: { name: 'Firefox', wmClass: 'firefox' } })]);
  model.setQuery('fire');
  model.cycleType();
  assert.equal(model.type, 'text');
  assert.equal(model.visible.length, 0);
  model.cycleType(true);
  model.cycleType(true);
  assert.equal(model.type, 'image');
  assert.deepEqual(model.visible.map((item) => item.id), ['c']);
});

test('PopupModel.setEntries keeps the selected entry when it still exists', () => {
  const model = new PopupModel(entries(5));
  model.move(2);
  model.setEntries([entry('new', 'text'), ...entries(5)]);
  assert.equal(model.selectedEntry?.id, 'e2');
  assert.equal(model.selected, 3);
});

test('PopupModel.setEntries keeps the position after the selected entry is removed', () => {
  const model = new PopupModel(entries(5));
  model.move(4);
  model.setEntries(entries(4));
  assert.equal(model.selected, 3);
  model.setEntries([]);
  assert.equal(model.selected, -1);
});

test('PopupModel.setEntries selects the first entry when nothing was selected', () => {
  const model = new PopupModel([]);
  assert.equal(model.selected, -1);
  model.setEntries(entries(3));
  assert.equal(model.selected, 0);
  assert.equal(model.selectedEntry?.id, 'e0');
});

test('PopupModel.select ignores an index out of range', () => {
  const model = new PopupModel(entries(3));
  model.select(2);
  assert.equal(model.selected, 2);
  model.select(7);
  assert.equal(model.selected, 2);
});

test('listItems puts a day header before each day', () => {
  const list = [
    entry('a', 'text', { createdAt: now }),
    entry('b', 'text', { createdAt: now - hour }),
    entry('c', 'text', { createdAt: now - day }),
    entry('d', 'text', { createdAt: now - 3 * day }),
  ];
  const items = listItems(list, 0, list.length, helsinki.dayKey, helsinki.dayKey(now));
  assert.deepEqual(
    items.map((item) => (item.kind === 'header' ? item.label : `${item.index}:${item.entry.id}`)),
    ['Today', '0:a', '1:b', 'Yesterday', '2:c', '2026-11-02', '3:d'],
  );
});

test('listItems for a later slice has no header when the day goes on', () => {
  const list = entries(4);
  const items = listItems(list, 2, 4, helsinki.dayKey, helsinki.dayKey(now));
  assert.deepEqual(
    items.map((item) => (item.kind === 'header' ? item.label : item.entry.id)),
    ['e2', 'e3'],
  );
});

test('rowTitle gives the first line that is not empty', () => {
  assert.equal(rowTitle(entry('a', 'text', { text: '\n\n  first line  \nsecond' })), 'first line');
  assert.equal(rowTitle(entry('a', 'text', { text: '   ' })), '');
  assert.equal(rowTitle(entry('a', 'text', { text: 'x'.repeat(500) })).length, 200);
});

test('rowTitle looks only at the start of a large text', () => {
  const large = `${'\n'.repeat(5000)}hidden`;
  assert.equal(rowTitle(entry('a', 'text', { text: large })), '');
  assert.equal(rowTitle(entry('a', 'text', { text: `head\n${'x'.repeat(1_000_000)}` })), 'head');
});

test('rowTitle gives the file name and the number of other files', () => {
  assert.equal(rowTitle(entry('a', 'file', { text: 'file:///home/u/My%20Notes.txt' })), 'My Notes.txt');
  assert.equal(rowTitle(entry('a', 'file', { text: 'file:///a/one.txt\r\nfile:///a/two.txt\r\nfile:///a/dir/' })), 'one.txt and 2 more');
});

test('rowTitle of an image gives the dimensions', () => {
  assert.equal(rowTitle(entry('a', 'image', { image: { width: 64, height: 48, bytes: 310 } })), 'Image 64 × 48');
});

test('previewText clamps the text and tells that it did', () => {
  const long = 'y'.repeat(previewLimit + 5);
  const text = previewText(entry('a', 'text', { text: long }));
  assert.ok(text.startsWith('y'.repeat(previewLimit)));
  assert.ok(text.endsWith('(Only the first 10000 characters are shown.)'));
  assert.equal(previewText(entry('a', 'text', { text: 'short' })), 'short');
});

test('previewText shows a file list as paths', () => {
  assert.equal(previewText(entry('a', 'file', { text: '# comment\nfile:///a/b%20c.txt\nfile:///d/' })), '/a/b c.txt\n/d/');
  assert.equal(previewText(entry('a', 'file', { text: 'file:///bad%E0%A4%A' })), '/bad%E0%A4%A');
});

test('colorCss gives an rgba() value for the classified color formats', () => {
  assert.equal(colorCss('#3584e4'), 'rgba(53, 132, 228, 1)');
  assert.equal(colorCss('#3584E480'), 'rgba(53, 132, 228, 0.502)');
  assert.equal(colorCss('rgb(10, 20, 30)'), 'rgba(10, 20, 30, 1)');
  assert.equal(colorCss('rgba(100%, 0%, 50%, 0.5)'), 'rgba(255, 0, 128, 0.5)');
  assert.equal(colorCss('hsl(120deg, 100%, 50%)'), 'rgba(0, 255, 0, 1)');
  assert.equal(colorCss('hsla(0, 100%, 50%, 25%)'), 'rgba(255, 0, 0, 0.25)');
  assert.equal(colorCss('rgb(1 2 3)'), 'rgba(1, 2, 3, 1)');
  assert.equal(colorCss('not a color'), null);
  assert.equal(colorCss('rgb(1, 2)'), null);
});

test('timeFormat gives the day key and the clock in the time zone', () => {
  assert.equal(helsinki.dayKey(now), '2026-11-05');
  assert.equal(helsinki.clock(now), '14:32');
  assert.equal(helsinki.clock(Date.UTC(2026, 10, 5, 22, 5)), '00:05');
});

test('timeFormat uses the default time zone for an unknown name', () => {
  const format = timeFormat('Not/AZone');
  assert.match(format.dayKey(now), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(format.clock(now), /^\d{2}:\d{2}$/);
  assert.match(timeFormat(undefined).clock(now), /^\d{2}:\d{2}$/);
});

test('copiedLabel gives Today, Yesterday or the date with the time', () => {
  assert.equal(copiedLabel(now - hour, now, helsinki), 'Today 13:32');
  assert.equal(copiedLabel(now - day, now, helsinki), 'Yesterday 14:32');
  assert.equal(copiedLabel(now - 3 * day, now, helsinki), '2026-11-02 14:32');
});

test('formatBytes gives bytes, KB or MB', () => {
  assert.equal(formatBytes(1), '1 byte');
  assert.equal(formatBytes(310), '310 bytes');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
});

test('informationRows for a text entry', () => {
  const rows = informationRows(entry('a', 'text', { text: 'hyvää yötä', app: { name: 'Text Editor', wmClass: 'org.gnome.TextEditor' } }), now, helsinki);
  assert.deepEqual(rows, [
    ['Application', 'Text Editor'],
    ['Content type', 'Text'],
    ['Size', '10 characters'],
    ['Copied', 'Today 14:32'],
  ]);
});

test('informationRows for an image entry has the dimensions and the size in bytes', () => {
  const rows = informationRows(entry('a', 'image', { image: { width: 64, height: 48, bytes: 310 } }), now, helsinki);
  assert.deepEqual(rows, [
    ['Application', 'Unknown'],
    ['Content type', 'Image'],
    ['Dimensions', '64 × 48'],
    ['Size', '310 bytes'],
    ['Copied', 'Today 14:32'],
  ]);
});

test('informationRows for a file list counts the files', () => {
  const rows = informationRows(entry('a', 'file', { text: 'file:///a\nfile:///b' }), now, helsinki);
  assert.deepEqual(rows[2], ['Size', '2 files']);
  assert.deepEqual(informationRows(entry('a', 'file', { text: 'file:///a' }), now, helsinki)[2], ['Size', '1 file']);
  assert.deepEqual(informationRows(entry('a', 'text', { text: 'x' }), now, helsinki)[2], ['Size', '1 character']);
});

test('characterCount counts code points and counts each entry once', () => {
  const smile = entry('a', 'text', { text: 'a😀b' });
  assert.equal(characterCount(smile), 3);
  const cached = { ...smile };
  assert.equal(characterCount(cached), 3);
  (cached as { text: string }).text = 'changed after the first count';
  assert.equal(characterCount(cached), 3);
});

test('fitSize scales down to fit and never scales up', () => {
  assert.deepEqual(fitSize(1000, 500, 400, 400), [400, 200]);
  assert.deepEqual(fitSize(500, 1000, 400, 400), [200, 400]);
  assert.deepEqual(fitSize(64, 48, 400, 400), [64, 48]);
  assert.deepEqual(fitSize(0, 0, 400, 400), [0, 0]);
});

test('popupSize is the same on a small and a large monitor', () => {
  assert.deepEqual(popupSize(1920, 1200, 1), [1152, 840]);
  assert.deepEqual(popupSize(3008, 1692, 1), [1152, 840]);
});

test('popupSize multiplies the size by the scale factor of the shell', () => {
  assert.deepEqual(popupSize(3840, 2400, 2), [2304, 1680]);
});

test('popupSize stays in a monitor that is smaller than the popup', () => {
  assert.deepEqual(popupSize(1024, 768, 1), [1024, 768]);
  assert.deepEqual(popupSize(1280, 800, 1), [1152, 800]);
});
