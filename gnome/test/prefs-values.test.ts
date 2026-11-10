import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  addWmClass,
  bytesToKiB,
  bytesToMiB,
  kibToBytes,
  maxImageMiBRange,
  maxTextKiBRange,
  mibToBytes,
  removeWmClass,
  rowChanges,
  versionLabel,
} from '../src/prefs-values.ts';

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

describe('text size', () => {
  test('converts the 1 MiB default to 1024 KiB and back', () => {
    assert.equal(bytesToKiB(1048576), 1024);
    assert.equal(kibToBytes(1024), 1048576);
  });

  test('rounds a size that is not a whole KiB', () => {
    assert.equal(bytesToKiB(1500), 1);
  });

  test('has the 1 MiB default on a step of the range', () => {
    assert.equal((bytesToKiB(1048576) - maxTextKiBRange.min) % maxTextKiBRange.step, 0);
  });

  test('fits the largest size in the 32-bit gsettings integer', () => {
    assert.ok(kibToBytes(maxTextKiBRange.max) <= 2 ** 31 - 1);
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

describe('rowChanges', () => {
  test('makes one row at the end for an added value and removes nothing', () => {
    assert.deepEqual(rowChanges(['kitty', 'foot'], ['kitty', 'foot', 'Tilix']), { remove: [], insert: [[2, 'Tilix']] });
  });

  test('removes only the row of a removed value', () => {
    assert.deepEqual(rowChanges(['kitty', 'foot', 'Tilix'], ['kitty', 'Tilix']), { remove: [1], insert: [] });
  });

  test('changes nothing when the rows show the list', () => {
    assert.deepEqual(rowChanges(['kitty', 'foot'], ['kitty', 'foot']), { remove: [], insert: [] });
  });

  test('makes all rows for an empty group', () => {
    assert.deepEqual(rowChanges([], ['kitty', 'foot']), { remove: [], insert: [[0, 'kitty'], [1, 'foot']] });
  });

  test('keeps the rows that stay in their order when values go and come back', () => {
    // A reset to the default list: extra goes, kitty and foot come back between the rows that stay.
    assert.deepEqual(rowChanges(['Alacritty', 'Tilix', 'extra'], ['Alacritty', 'kitty', 'foot', 'Tilix']), {
      remove: [2],
      insert: [[1, 'kitty'], [2, 'foot']],
    });
  });

  test('makes a row again when its value moves before a row that stays', () => {
    assert.deepEqual(rowChanges(['kitty', 'foot'], ['foot', 'kitty']), { remove: [1], insert: [[0, 'foot']] });
  });

  test('gives rows that show the wanted list when the changes are applied', () => {
    const apply = (shown: string[], wanted: string[]): string[] => {
      const { remove, insert } = rowChanges(shown, wanted);
      const rows = shown.filter((_, index) => !remove.includes(index));
      insert.forEach(([index, value]) => rows.splice(index, 0, value));
      return rows;
    };
    const lists = [[], ['a'], ['a', 'b', 'c'], ['c', 'a', 'b'], ['b', 'd'], ['a', 'a'], ['d', 'c', 'b', 'a']];
    for (const shown of lists) {
      for (const wanted of lists) {
        assert.deepEqual(apply(shown, wanted), wanted, `${JSON.stringify(shown)} to ${JSON.stringify(wanted)}`);
      }
    }
  });
});

describe('versionLabel', () => {
  test('shows a release version with a v', () => {
    assert.equal(versionLabel('1.2.3'), 'Leike v1.2.3');
  });

  test('shows a development build with its commit', () => {
    assert.equal(versionLabel('git-abcdf12'), 'Leike git-abcdf12');
  });

  test('shows only the name when the metadata has no version', () => {
    assert.equal(versionLabel(undefined), 'Leike');
  });
});
