import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keysFor, type ClipboardAction, type KeyChord } from '../src/index.js';

const terminals = ['org.gnome.Terminal', 'Alacritty', 'kitty'];

const cases: Array<[ClipboardAction, string | null, KeyChord]> = [
  ['copy', 'org.gnome.TextEditor', { shift: false, key: 'c' }],
  ['paste', 'org.gnome.TextEditor', { shift: false, key: 'v' }],
  ['cut', 'org.gnome.TextEditor', { shift: false, key: 'x' }],
  ['copy', 'org.gnome.Terminal', { shift: true, key: 'c' }],
  ['paste', 'org.gnome.Terminal', { shift: true, key: 'v' }],
  ['cut', 'org.gnome.Terminal', { shift: true, key: 'x' }],
  ['copy', 'alacritty', { shift: true, key: 'c' }],
  ['paste', 'KITTY', { shift: true, key: 'v' }],
  ['copy', 'kitty-like', { shift: false, key: 'c' }],
  ['copy', null, { shift: false, key: 'c' }],
  ['paste', null, { shift: false, key: 'v' }],
  ['cut', null, { shift: false, key: 'x' }],
];

for (const [action, wmClass, expected] of cases) {
  test(`keysFor sends ${expected.shift ? 'Ctrl+Shift' : 'Ctrl'}+${expected.key} for ${action} in ${wmClass ?? 'no window'}`, () => {
    // Act
    const chord = keysFor(action, wmClass, terminals);

    // Assert
    assert.deepEqual(chord, expected);
  });
}

test('keysFor does not use Shift when the terminal list is empty', () => {
  // Act
  const chord = keysFor('paste', 'org.gnome.Terminal', []);

  // Assert
  assert.deepEqual(chord, { shift: false, key: 'v' });
});
