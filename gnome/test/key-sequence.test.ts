import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyCode, keySequence } from '../src/key-sequence.ts';

test('keySequence releases both keys of a held modifier, sends the chord, restores the left key and releases the letter last', () => {
  assert.deepEqual(keySequence({ shift: false, key: 'v' }, ['Super'], ['Super']), [
    ['Super_L', false],
    ['Super_R', false],
    ['Control_L', true],
    ['v', true],
    ['Control_L', false],
    ['Super_L', true],
    ['v', false],
  ]);
});

test('keySequence does not restore a held modifier that is up now', () => {
  assert.deepEqual(keySequence({ shift: false, key: 'c' }, ['Super'], []), [
    ['Super_L', false],
    ['Super_R', false],
    ['Control_L', true],
    ['c', true],
    ['Control_L', false],
    ['c', false],
  ]);
});

test('keySequence does not touch a modifier that was not held at the key press', () => {
  assert.deepEqual(keySequence({ shift: false, key: 'x' }, [], ['Shift']), [
    ['Control_L', true],
    ['x', true],
    ['Control_L', false],
    ['x', false],
  ]);
});

test('keySequence sends Ctrl+Shift+key to a terminal and releases Shift before Ctrl', () => {
  assert.deepEqual(keySequence({ shift: true, key: 'v' }, ['Shift'], ['Shift']), [
    ['Shift_L', false],
    ['Shift_R', false],
    ['Control_L', true],
    ['Shift_L', true],
    ['v', true],
    ['Shift_L', false],
    ['Control_L', false],
    ['Shift_L', true],
    ['v', false],
  ]);
});

test('keySequence releases and restores each modifier of a shortcut with two modifiers', () => {
  assert.deepEqual(keySequence({ shift: false, key: 'v' }, ['Control', 'Alt'], ['Control', 'Alt']), [
    ['Control_L', false],
    ['Control_R', false],
    ['Alt_L', false],
    ['Alt_R', false],
    ['Control_L', true],
    ['v', true],
    ['Control_L', false],
    ['Control_L', true],
    ['Alt_L', true],
    ['v', false],
  ]);
});

test('keyCode gives the code of the pressed key for its own letter', () => {
  // Dvorak: the V key is at the position of the QWERTY period key.
  assert.equal(keyCode('v', { unicode: 'v', code: 60 }), 60);
  assert.equal(keyCode('v', { unicode: 'V', code: 60 }), 60);
});

test('keyCode gives the QWERTY position of a letter that is not the pressed key', () => {
  assert.equal(keyCode('v', { unicode: '\r', code: 36 }), 55);
  assert.equal(keyCode('c', { unicode: 'k', code: 45 }), 54);
  assert.equal(keyCode('x', null), 53);
});

test('keyCode gives the PC keyboard codes of the modifier keys', () => {
  assert.deepEqual(
    (['Shift_L', 'Shift_R', 'Control_L', 'Control_R', 'Alt_L', 'Alt_R', 'Super_L', 'Super_R'] as const).map((name) => keyCode(name, null)),
    [50, 62, 37, 105, 64, 108, 133, 134],
  );
});
