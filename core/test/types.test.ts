import assert from 'node:assert/strict';
import { test } from 'node:test';
import { entryTypes } from '../src/index.js';

test('entryTypes lists the five types in the type filter order', () => {
  assert.deepEqual(entryTypes, ['text', 'link', 'color', 'file', 'image']);
});
