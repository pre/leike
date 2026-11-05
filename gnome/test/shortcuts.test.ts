import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ShortcutAction } from '../src/key-names.ts';
import { shortcutActions } from '../src/key-names.ts';
import { applyCapture, captureProblem, findConflict, shortcutSubtitles } from '../src/shortcuts.ts';

describe('shortcutSubtitles', () => {
  test('has a text for each action', () => {
    assert.deepEqual(Object.keys(shortcutSubtitles).sort(), [...shortcutActions].sort());
  });
});

describe('captureProblem', () => {
  const free = (): string | null => null;

  test('accepts a shortcut with Super', () => {
    assert.equal(captureProblem('<Super>v', free), null);
    assert.equal(captureProblem('<Mod5><Super>c', free), null);
  });

  test('asks for a modifier other than Shift and AltGr', () => {
    assert.equal(captureProblem('<Shift>Left', free), 'Use at least one of Ctrl, Alt or Super.');
    assert.equal(captureProblem('<Mod5>c', free), 'Use at least one of Ctrl, Alt or Super.');
  });

  test('names the action that uses the shortcut', () => {
    const conflictOf = (accelerator: string): string | null => (accelerator === '<Super>c' ? 'Copy' : null);
    assert.equal(captureProblem('<Super>c', conflictOf), 'Copy already uses this shortcut.');
  });

  test('accepts the empty accelerator, which disables the action', () => {
    assert.equal(captureProblem('', free), null);
  });
});

describe('findConflict', () => {
  const bindings = new Map<ShortcutAction, readonly string[]>([
    ['copy', ['<Super>c']],
    ['paste', ['<Super>v']],
    ['cut', []],
    ['open-history', ['<Super><Mod5>c', '<Super><Alt>c']],
  ]);

  test('finds the other action that uses the accelerator', () => {
    assert.equal(findConflict('<super>C', 'paste', bindings), 'copy');
    assert.equal(findConflict('<Alt><Super>c', 'copy', bindings), 'open-history');
  });

  test('ignores the action that is being changed', () => {
    assert.equal(findConflict('<Super>c', 'copy', bindings), null);
  });

  test('returns null for a free accelerator', () => {
    assert.equal(findConflict('<Super>x', 'cut', bindings), null);
  });

  test('keeps AltGr and Alt apart', () => {
    const altGrOnly = new Map<ShortcutAction, readonly string[]>([['open-history', ['<Super><Mod5>c']]]);
    assert.equal(findConflict('<Super><Alt>c', 'copy', altGrOnly), null);
  });

  test('never reports a conflict for an empty accelerator', () => {
    assert.equal(findConflict('', 'copy', new Map([['cut', ['']]])), null);
  });
});

describe('applyCapture', () => {
  const current = ['<Super><Mod5>c', '<Super><Alt>c'];

  test('replaces all accelerators with set', () => {
    assert.deepEqual(applyCapture(current, '<Super>h', 'set'), ['<Super>h']);
  });

  test('adds one accelerator with add', () => {
    assert.deepEqual(applyCapture(current, '<Super>h', 'add'), [...current, '<Super>h']);
  });

  test('does not add an accelerator that the action has', () => {
    assert.deepEqual(applyCapture(current, '<Alt><Super>C', 'add'), current);
  });

  test('disables the action for the empty accelerator', () => {
    assert.deepEqual(applyCapture(current, '', 'set'), []);
    assert.deepEqual(applyCapture(current, '', 'add'), []);
  });
});
