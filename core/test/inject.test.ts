import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keysFor, type ClipboardAction, type ClipboardContent, type KeyChord } from '../src/index.js';

const terminals = ['org.gnome.Terminal', 'Alacritty', 'kitty'];

const cases: Array<[ClipboardAction, string | null, ClipboardContent, KeyChord]> = [
  ['copy', 'org.gnome.TextEditor', 'text', { shift: false, key: 'c' }],
  ['paste', 'org.gnome.TextEditor', 'text', { shift: false, key: 'v' }],
  ['cut', 'org.gnome.TextEditor', 'text', { shift: false, key: 'x' }],
  ['copy', 'org.gnome.Terminal', 'text', { shift: true, key: 'c' }],
  ['paste', 'org.gnome.Terminal', 'text', { shift: true, key: 'v' }],
  ['cut', 'org.gnome.Terminal', 'text', { shift: true, key: 'x' }],
  ['copy', 'alacritty', 'text', { shift: true, key: 'c' }],
  ['paste', 'KITTY', 'text', { shift: true, key: 'v' }],
  ['copy', 'kitty-like', 'text', { shift: false, key: 'c' }],
  ['copy', null, 'text', { shift: false, key: 'c' }],
  ['paste', null, 'text', { shift: false, key: 'v' }],
  ['cut', null, 'text', { shift: false, key: 'x' }],
  ['paste', 'org.gnome.Terminal', 'image', { shift: false, key: 'v' }],
  ['paste', 'KITTY', 'image', { shift: false, key: 'v' }],
  ['paste', 'org.gnome.TextEditor', 'image', { shift: false, key: 'v' }],
  ['paste', null, 'image', { shift: false, key: 'v' }],
  ['copy', 'org.gnome.Terminal', 'image', { shift: true, key: 'c' }],
  ['cut', 'org.gnome.Terminal', 'image', { shift: true, key: 'x' }],
];

for (const [action, wmClass, content, expected] of cases) {
  test(`keysFor sends ${expected.shift ? 'Ctrl+Shift' : 'Ctrl'}+${expected.key} for ${action} in ${wmClass ?? 'no window'} with ${content} content`, () => {
    // Act
    const chord = keysFor(action, wmClass, terminals, content);

    // Assert
    assert.deepEqual(chord, expected);
  });
}

test('keysFor does not use Shift when the terminal list is empty', () => {
  // Act
  const chord = keysFor('paste', 'org.gnome.Terminal', [], 'text');

  // Assert
  assert.deepEqual(chord, { shift: false, key: 'v' });
});
