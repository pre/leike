import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  conflictSections,
  conflictWording,
  findGnomeConflicts,
  gnomeKeyTitle,
  rowConflicts,
  schemaShortName,
  schemaTitle,
  withoutAccelerator,
  type KeybindingTables,
} from '../src/gnome-conflicts.ts';
import type { ShortcutAction } from '../src/key-names.ts';

/** The GNOME 46 defaults that matter for the Leike defaults. */
const gnome46: KeybindingTables = new Map([
  ['org.gnome.shell.keybindings', new Map([['toggle-message-tray', ['<Super>v', '<Super>m']]])],
  ['org.gnome.desktop.wm.keybindings', new Map([['close', ['<Alt>F4']]])],
  ['org.gnome.mutter.keybindings', new Map([['toggle-tiled-left', []]])],
]);

const leikeDefaults = new Map<ShortcutAction, readonly string[]>([
  ['copy', ['<Super>c']],
  ['paste', ['<Super>v']],
  ['cut', ['<Super>x']],
  ['open-history', ['<Super><Mod5>c', '<Super><Alt>c']],
]);

describe('findGnomeConflicts', () => {
  test('finds the notification list for Super+V', () => {
    assert.deepEqual(findGnomeConflicts('<super>V', gnome46), [
      { schema: 'org.gnome.shell.keybindings', key: 'toggle-message-tray' },
    ]);
  });

  test('finds keys in every schema', () => {
    const both: KeybindingTables = new Map([
      ['a.b', new Map([['one', ['<Control>x']]])],
      ['c.d', new Map([['two', ['<Primary>X']]])],
    ]);
    assert.deepEqual(findGnomeConflicts('<Ctrl>x', both), [
      { schema: 'a.b', key: 'one' },
      { schema: 'c.d', key: 'two' },
    ]);
  });

  test('returns nothing for a free accelerator', () => {
    assert.deepEqual(findGnomeConflicts('<Super>c', gnome46), []);
  });

  test('returns nothing for an empty accelerator', () => {
    assert.deepEqual(findGnomeConflicts('', new Map([['a.b', new Map([['one', ['']]])]])), []);
  });
});

describe('rowConflicts', () => {
  test('finds only the paste conflict for the Leike defaults on GNOME 46', () => {
    assert.deepEqual(rowConflicts('paste', leikeDefaults, gnome46), [
      { kind: 'gnome', schema: 'org.gnome.shell.keybindings', key: 'toggle-message-tray', accelerator: '<Super>v' },
    ]);
    for (const action of ['copy', 'cut', 'open-history'] as const) {
      assert.deepEqual(rowConflicts(action, leikeDefaults, gnome46), [], action);
    }
  });

  test('lists the other Leike actions with the same accelerator', () => {
    const bindings = new Map<ShortcutAction, readonly string[]>([
      ['copy', ['<Super>c']],
      ['open-history', ['<Super><Alt>c', '<super>C']],
    ]);
    assert.deepEqual(rowConflicts('copy', bindings, new Map()), [
      { kind: 'leike', action: 'open-history', accelerator: '<Super>c' },
    ]);
    assert.deepEqual(rowConflicts('open-history', bindings, new Map()), [
      { kind: 'leike', action: 'copy', accelerator: '<super>C' },
    ]);
  });

  test('lists the GNOME keys before the Leike actions', () => {
    const bindings = new Map<ShortcutAction, readonly string[]>([
      ['paste', ['<Super>v']],
      ['cut', ['<Super>v']],
    ]);
    assert.deepEqual(
      rowConflicts('paste', bindings, gnome46).map((conflict) => conflict.kind),
      ['gnome', 'leike'],
    );
  });

  test('returns nothing for a disabled action', () => {
    assert.deepEqual(rowConflicts('paste', new Map([['paste', []]]), gnome46), []);
  });
});

describe('withoutAccelerator', () => {
  test('removes Super+V and keeps Super+M for the notification list', () => {
    assert.deepEqual(withoutAccelerator(['<Super>v', '<Super>m'], '<Super>V'), ['<Super>m']);
  });
});

describe('schemaShortName and schemaTitle', () => {
  test('give a name for the user', () => {
    assert.equal(schemaShortName('org.gnome.shell.keybindings'), 'Shell');
    assert.equal(schemaShortName('org.example.other'), 'org.example.other');
    assert.equal(schemaTitle('org.gnome.mutter.keybindings'), 'Mutter keybindings');
    assert.equal(schemaTitle('org.gnome.settings-daemon.plugins.media-keys'), 'Media Keys');
    assert.equal(schemaTitle('org.example.keybindings'), 'org.example.keybindings');
  });
});

describe('gnomeKeyTitle', () => {
  test('names the notification list key', () => {
    assert.equal(
      gnomeKeyTitle({ schema: 'org.gnome.shell.keybindings', key: 'toggle-message-tray' }),
      'Show the notification list (Shell keybindings › toggle-message-tray)',
    );
  });

  test('uses the schema and the key for the other keys', () => {
    assert.equal(
      gnomeKeyTitle({ schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-left' }),
      'Mutter keybindings › toggle-tiled-left',
    );
  });
});

describe('conflictWording', () => {
  test('tells the user to remove the GNOME key', () => {
    assert.deepEqual(conflictWording({ schema: 'org.gnome.shell.keybindings', key: 'toggle-message-tray' }, 'Super V'), {
      explanation: 'GNOME handles this shortcut before Leike. Remove it from GNOME to let Leike use it.',
      entry: 'Show the notification list (Shell keybindings › toggle-message-tray): Super V',
      button: 'Remove from GNOME',
    });
  });

  test('says what the IBus emoji picker does with the shortcut', () => {
    const wording = conflictWording({ schema: 'org.freedesktop.ibus.panel.emoji', key: 'hotkey' }, 'Super .');
    assert.match(wording.explanation, /^IBus opens its emoji picker with this shortcut before Leike sees it/);
    assert.equal(wording.entry, 'IBus emoji picker (Super .)');
    assert.equal(wording.button, 'Turn off the IBus emoji shortcut');
  });

  test('uses the GNOME texts for the IBus unicode hotkey, which is not the emoji picker', () => {
    const wording = conflictWording({ schema: 'org.freedesktop.ibus.panel.emoji', key: 'unicode-hotkey' }, 'Ctrl Shift U');
    assert.equal(wording.entry, 'IBus emoji › unicode-hotkey: Ctrl Shift U');
    assert.equal(wording.button, 'Remove from GNOME');
  });
});

describe('conflictSections', () => {
  const ibus = { schema: 'org.freedesktop.ibus.panel.emoji', key: 'hotkey' };
  const shell = { schema: 'org.gnome.shell.keybindings', key: 'toggle-message-tray' };
  const mutter = { schema: 'org.gnome.mutter.keybindings', key: 'toggle-tiled-left' };

  test('puts IBus and GNOME keys in their own sections, in the order of the keys', () => {
    const sections = conflictSections([shell, ibus, mutter], () => 'Super .');
    assert.deepEqual(
      sections.map((section) => section.entries.map((entry) => entry.binding)),
      [[shell, mutter], [ibus]],
    );
  });

  test('returns no sections for no keys', () => {
    assert.deepEqual(conflictSections([], () => ''), []);
  });
});
