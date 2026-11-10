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

// The mime type lists of image copies, recorded in a GNOME Shell 46 sandbox on 2026-11-10.
const imageCopies: Record<string, string[]> = {
  'wl-copy --type image/png': ['image/png'],
  'Google Chrome 157 and Microsoft Edge 156, Copy image': [
    'chromium/x-source-url',
    'chromium/x-internal-source-rfh-token',
    'image/png',
    'text/html',
  ],
  // The image viewer offers the file path as text with the image.
  'GNOME Image Viewer 45.3, Ctrl+C': [
    'application/vnd.portal.files',
    'application/vnd.portal.filetransfer',
    'text/uri-list',
    'text/plain',
    'text/plain;charset=utf-8',
    'STRING',
    'TEXT',
    'COMPOUND_TEXT',
    'UTF8_STRING',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'image/jpeg',
    'image/png',
  ],
  // Not recorded: from the Firefox source (cmd_copyImage copies the image data and HTML, and no text).
  'Firefox, Copy Image': ['text/html', 'text/_moz_htmlcontext', 'text/_moz_htmlinfo', 'image/png', 'image/jpeg'],
};

for (const [name, mimes] of Object.entries(imageCopies)) {
  test(`chooseRead reads the image of the image copy: ${name}`, () => {
    assert.deepEqual(chooseRead(mimes), { kind: 'image', mime: 'image/png' });
  });
}

test('chooseRead reads the text of a spreadsheet cell, which also offers a picture of the cell', () => {
  // Not recorded: the types of a LibreOffice Calc cell copy from the LibreOffice source, without its application types.
  const calcCells = [
    'image/png',
    'text/html',
    'text/plain;charset=utf-16',
    'text/rtf',
    'text/richtext',
    'text/plain;charset=utf-8',
    'UTF8_STRING',
    'STRING',
  ];
  assert.deepEqual(chooseRead(calcCells), { kind: 'text', mime: 'text/plain;charset=utf-8' });
});

test('chooseRead reads the text of a browser selection with text and an image', () => {
  // Recorded: Google Chrome 157, Select all and Ctrl+C on a page with an image.
  const selection = [
    'text/html',
    'STRING',
    'chromium/x-source-url',
    'TEXT',
    'text/plain;charset=utf-8',
    'chromium/x-internal-source-rfh-token',
    'UTF8_STRING',
    'text/plain',
  ];
  assert.deepEqual(chooseRead(selection), { kind: 'text', mime: 'text/plain;charset=utf-8' });
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
