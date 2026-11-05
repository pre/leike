import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openPrefsOnFirstRun, type FirstRunSettings } from '../src/first-run.ts';

function fakeSettings(firstRunDone: boolean): FirstRunSettings & { values: Map<string, boolean> } {
  const values = new Map([['first-run-done', firstRunDone]]);
  return {
    values,
    get_boolean: (key) => values.get(key) ?? false,
    set_boolean: (key, value) => {
      values.set(key, value);
      return true;
    },
  };
}

describe('openPrefsOnFirstRun', () => {
  test('opens the preferences at the first run and records it', () => {
    const settings = fakeSettings(false);
    let opened = 0;
    assert.equal(
      openPrefsOnFirstRun(settings, () => opened++),
      true,
    );
    assert.equal(opened, 1);
    assert.equal(settings.values.get('first-run-done'), true);
  });

  test('opens the preferences only one time', () => {
    const settings = fakeSettings(false);
    let opened = 0;
    openPrefsOnFirstRun(settings, () => opened++);
    assert.equal(
      openPrefsOnFirstRun(settings, () => opened++),
      false,
    );
    assert.equal(opened, 1);
  });

  test('does not open the preferences after the first run', () => {
    let opened = 0;
    assert.equal(
      openPrefsOnFirstRun(fakeSettings(true), () => opened++),
      false,
    );
    assert.equal(opened, 0);
  });

  test('records the first run before it opens the window, so an error does not repeat it', () => {
    const settings = fakeSettings(false);
    assert.throws(() =>
      openPrefsOnFirstRun(settings, () => {
        throw new Error('no window');
      }),
    );
    assert.equal(settings.values.get('first-run-done'), true);
  });
});
