import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  appInfo,
  chooseRead,
  idGenerator,
  imageIncoming,
  isBlockedWmClass,
  isSafeId,
  pngSize,
  textIncoming,
} from '../src/incoming.ts';

test('chooseRead skips a password manager change before it looks at other types', () => {
  // The types of a KeePassXC password copy.
  const keepassxc = ['text/plain', 'text/plain;charset=utf-8', 'UTF8_STRING', 'STRING', 'TEXT', 'x-kde-passwordManagerHint'];
  assert.deepEqual(chooseRead(keepassxc), { kind: 'skip', reason: 'password' });
  assert.deepEqual(chooseRead(['image/png', 'x-kde-passwordManagerHint']), { kind: 'skip', reason: 'password' });
});

test('chooseRead prefers image/png in any position', () => {
  assert.deepEqual(chooseRead(['text/plain', 'image/png']), { kind: 'image', mime: 'image/png' });
});

test('chooseRead takes text/uri-list before plain text', () => {
  assert.deepEqual(chooseRead(['text/plain', 'text/uri-list', 'x-special/gnome-copied-files']), { kind: 'text', mime: 'text/uri-list' });
});

test('chooseRead takes the utf-8 text type of a wl-copy text', () => {
  const mimes = ['UTF8_STRING', 'STRING', 'TEXT', 'text/plain;charset=utf-8', 'text/plain', 'text/plain'];
  assert.deepEqual(chooseRead(mimes), { kind: 'text', mime: 'text/plain;charset=utf-8' });
});

test('chooseRead takes the legacy X11 text types', () => {
  assert.deepEqual(chooseRead(['STRING']), { kind: 'text', mime: 'STRING' });
});

test('chooseRead skips a change with no supported type', () => {
  assert.deepEqual(chooseRead(['image/jpeg']), { kind: 'skip', reason: 'no-supported-type' });
  assert.deepEqual(chooseRead([]), { kind: 'skip', reason: 'no-supported-type' });
});

function png(width: number, height: number): Uint8Array {
  const data = new Uint8Array(33);
  data.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(data.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return data;
}

test('pngSize reads the width and height from the IHDR chunk', () => {
  assert.deepEqual(pngSize(png(1920, 1080)), { width: 1920, height: 1080 });
});

test('pngSize reads a PNG that starts inside a larger buffer', () => {
  const buffer = new Uint8Array(40);
  buffer.set(png(3, 4), 7);
  assert.deepEqual(pngSize(buffer.subarray(7)), { width: 3, height: 4 });
});

test('pngSize gives null for data that is not a PNG', () => {
  assert.equal(pngSize(new Uint8Array(10)), null);
  assert.equal(pngSize(new TextEncoder().encode('GIF89a and more bytes for the length')), null);
  const noIhdr = png(1, 1);
  noIhdr[12] = 0;
  assert.equal(pngSize(noIhdr), null);
});

test('idGenerator gives time-ordered ids with a counter in the same millisecond', () => {
  const nextId = idGenerator();
  assert.deepEqual([nextId(1000), nextId(1000), nextId(1001), nextId(1001), nextId(1002)], ['1000-0', '1000-1', '1001-0', '1001-1', '1002-0']);
});

test('isSafeId accepts the generated ids and rejects path parts', () => {
  assert.equal(isSafeId('1793900000000-3'), true);
  assert.equal(isSafeId('../history'), false);
  assert.equal(isSafeId('a/b'), false);
  assert.equal(isSafeId(''), false);
});

test('textIncoming and imageIncoming add the app only when there is one', () => {
  assert.deepEqual(textIncoming('1-0', 'hello', 'h1', 5), { id: '1-0', text: 'hello', hash: 'h1', now: 5 });
  const app = { name: 'Text Editor', wmClass: 'org.gnome.TextEditor' };
  assert.deepEqual(imageIncoming('2-0', { width: 1, height: 2, bytes: 3 }, 'h2', 6, app), {
    id: '2-0',
    image: { width: 1, height: 2, bytes: 3 },
    hash: 'h2',
    now: 6,
    app,
  });
});

test('appInfo takes the app name, else the title, else the WM_CLASS', () => {
  assert.deepEqual(appInfo('org.gnome.TextEditor', 'Text Editor', 'notes.txt'), { name: 'Text Editor', wmClass: 'org.gnome.TextEditor' });
  assert.deepEqual(appInfo('foot', null, 'foot: ~'), { name: 'foot: ~', wmClass: 'foot' });
  assert.deepEqual(appInfo('foot', '', ''), { name: 'foot', wmClass: 'foot' });
  assert.equal(appInfo(null, 'x', 'y'), undefined);
  assert.equal(appInfo('', 'x', 'y'), undefined);
});

test('isBlockedWmClass compares without case and accepts no window', () => {
  assert.equal(isBlockedWmClass('Bitwarden', ['bitwarden']), true);
  assert.equal(isBlockedWmClass('firefox', ['bitwarden']), false);
  assert.equal(isBlockedWmClass(null, ['bitwarden']), false);
});
