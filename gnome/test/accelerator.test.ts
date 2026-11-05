import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  acceleratorText,
  addAltGr,
  hasCommandModifier,
  modifierLabelsOf,
  normalizeAccelerator,
  splitAccelerator,
  withoutAltGrLevel,
} from '../src/accelerator.ts';

describe('splitAccelerator', () => {
  test('gives the modifiers with the aliases resolved and the key', () => {
    assert.deepEqual(splitAccelerator('<Super><Mod5>c'), { modifiers: ['Super', 'Mod5'], key: 'c' });
    assert.deepEqual(splitAccelerator('<Primary><mod1>Page_Up'), { modifiers: ['Control', 'Alt'], key: 'Page_Up' });
  });

  test('gives no key for an empty accelerator', () => {
    assert.deepEqual(splitAccelerator(''), { modifiers: [], key: '' });
  });
});

describe('normalizeAccelerator', () => {
  const pairs: readonly (readonly [string, string])[] = [
    ['<Super>v', '<Super>v'],
    ['<super>V', '<Super>v'],
    ['<Mod4>v', '<Super>v'],
    ['<Super><Mod5>c', '<Mod5><Super>c'],
    ['<mod5><super>C', '<Mod5><Super>c'],
    ['<Alt><Super>c', '<Alt><Super>c'],
    ['<Super><Alt>c', '<Alt><Super>c'],
    ['<Primary><Shift>u', '<Control><Shift>u'],
    ['<Ctrl><Shft>U', '<Control><Shift>u'],
    ['<Super>Page_Up', '<Super>Page_Up'],
    ['', ''],
  ];

  test('gives the same form for accelerators that GTK and Mutter treat as the same', () => {
    for (const [input, canonical] of pairs) {
      assert.equal(normalizeAccelerator(input), canonical, input);
    }
  });

  test('keeps AltGr and Alt apart', () => {
    assert.notEqual(normalizeAccelerator('<Super><Mod5>c'), normalizeAccelerator('<Super><Alt>c'));
  });
});

describe('hasCommandModifier', () => {
  test('accepts Control, Alt, Super, Meta and Hyper', () => {
    for (const modifier of ['Control', 'Alt', 'Super', 'Meta', 'Hyper', 'Primary']) {
      assert.equal(hasCommandModifier(`<${modifier}>Left`), true, modifier);
    }
  });

  test('rejects a bare key, Shift only and AltGr only, which type text', () => {
    assert.equal(hasCommandModifier('a'), false);
    assert.equal(hasCommandModifier('<Shift>Left'), false);
    assert.equal(hasCommandModifier('<Mod5>c'), false);
    assert.equal(hasCommandModifier('<Shift><Mod5>c'), false);
  });

  test('accepts AltGr with Super', () => {
    assert.equal(hasCommandModifier('<Super><Mod5>c'), true);
  });
});

describe('modifierLabelsOf', () => {
  test('names Mod5 AltGr and puts Super first', () => {
    assert.deepEqual(modifierLabelsOf('<Super><Mod5>c'), ['Super', 'AltGr']);
    assert.deepEqual(modifierLabelsOf('<Shift><Primary><Mod5><Alt><Super>c'), ['Super', 'Ctrl', 'Alt', 'AltGr', 'Shift']);
  });

  test('gives no labels for an accelerator without modifiers', () => {
    assert.deepEqual(modifierLabelsOf('F1'), []);
  });
});

describe('withoutAltGrLevel', () => {
  test('keeps the levels without AltGr', () => {
    assert.deepEqual(withoutAltGrLevel(0), { altGr: false, level: 0 });
    assert.deepEqual(withoutAltGrLevel(1), { altGr: false, level: 1 });
  });

  test('gives the level without AltGr for levels 2 and 3', () => {
    assert.deepEqual(withoutAltGrLevel(2), { altGr: true, level: 0 });
    assert.deepEqual(withoutAltGrLevel(3), { altGr: true, level: 1 });
  });
});

describe('addAltGr', () => {
  test('adds Mod5', () => {
    assert.equal(addAltGr('<Super>c'), '<Mod5><Super>c');
  });

  test('does not add Mod5 two times', () => {
    assert.equal(addAltGr('<Super><Mod5>c'), '<Super><Mod5>c');
  });

  test('keeps the empty accelerator', () => {
    assert.equal(addAltGr(''), '');
  });
});

describe('acceleratorText', () => {
  const upper = (key: string): string => key.toUpperCase();

  test('shows the AltGr default of Open history as Super AltGr C', () => {
    assert.equal(acceleratorText('<Super><Mod5>c', upper), 'Super AltGr C');
  });

  test('shows the Alt default of Open history as Super Alt C', () => {
    assert.equal(acceleratorText('<Super><Alt>c', upper), 'Super Alt C');
  });

  test('asks for the label of the key name, not of the AltGr symbol', () => {
    const asked: string[] = [];
    acceleratorText('<Super><Mod5>c', (key) => {
      asked.push(key);
      return key;
    });
    assert.deepEqual(asked, ['c']);
  });

  test('writes BackSpace as Backspace', () => {
    assert.equal(acceleratorText('<Super>BackSpace', (key) => key), 'Super Backspace');
  });

  test('shows Disabled for the empty accelerator', () => {
    assert.equal(acceleratorText('', upper), 'Disabled');
  });
});
