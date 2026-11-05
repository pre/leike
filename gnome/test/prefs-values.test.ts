import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addWmClass, bytesToMiB, maxImageMiBRange, mibToBytes, removeWmClass } from '../src/prefs-values.ts';

describe('image size', () => {
  test('converts the 10 MiB default both ways', () => {
    assert.equal(bytesToMiB(10485760), 10);
    assert.equal(mibToBytes(10), 10485760);
  });

  test('rounds a size that is not a whole MiB', () => {
    assert.equal(bytesToMiB(1500000), 1);
  });

  test('fits the largest size in the 32-bit gsettings integer', () => {
    assert.ok(mibToBytes(maxImageMiBRange.max) <= 2 ** 31 - 1);
  });
});

describe('addWmClass', () => {
  test('adds the WM_CLASS at the end without spaces around it', () => {
    assert.deepEqual(addWmClass(['kitty'], '  foot '), { list: ['kitty', 'foot'], problem: null });
  });

  test('refuses an empty value', () => {
    assert.deepEqual(addWmClass([], '   '), { list: null, problem: 'Type a WM_CLASS value.' });
  });

  test('refuses a WM_CLASS that is in the list in another case', () => {
    assert.deepEqual(addWmClass(['Alacritty'], 'alacritty'), { list: null, problem: 'alacritty is already in the list.' });
  });
});

describe('removeWmClass', () => {
  test('removes only the given WM_CLASS', () => {
    assert.deepEqual(removeWmClass(['kitty', 'foot', 'Tilix'], 'foot'), ['kitty', 'Tilix']);
  });
});
