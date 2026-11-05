import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keySequence } from '../src/key-sequence.ts';

test('keySequence sends Ctrl+key', () => {
  assert.deepEqual(keySequence({ shift: false, key: 'c' }), [
    ['Control_L', true],
    ['c', true],
    ['c', false],
    ['Control_L', false],
  ]);
});

test('keySequence sends Ctrl+Shift+key and releases Shift before Ctrl', () => {
  assert.deepEqual(keySequence({ shift: true, key: 'v' }), [
    ['Control_L', true],
    ['Shift_L', true],
    ['v', true],
    ['v', false],
    ['Shift_L', false],
    ['Control_L', false],
  ]);
});
