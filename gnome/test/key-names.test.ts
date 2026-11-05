import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { normalizeAccelerator } from '../src/accelerator.ts';
import { shortcutActions } from '../src/key-names.ts';

const schema = readFileSync(new URL('../schemas/org.gnome.shell.extensions.leike.gschema.xml', import.meta.url), 'utf8');
const wmClassKeys = ['terminal-wm-classes', 'blocklist-wm-classes'];
const keybindingKeys = [...schema.matchAll(/<key name="([^"]+)" type="as">/g)]
  .map((match) => match[1] ?? '')
  .filter((key) => !wmClassKeys.includes(key));

function defaultOf(key: string): string[] {
  const match = new RegExp(`<key name="${key}" type="as">\\s*<default><!\\[CDATA\\[(\\[.*\\])\\]\\]></default>`).exec(schema);
  return JSON.parse((match?.[1] ?? '[]').replaceAll("'", '"')) as string[];
}

describe('shortcutActions', () => {
  test('are exactly the keybinding keys of the schema', () => {
    assert.deepEqual([...shortcutActions].sort(), [...keybindingKeys].sort());
  });

  test('are in the order copy, paste, cut, open history', () => {
    assert.deepEqual(shortcutActions, ['copy', 'paste', 'cut', 'open-history']);
  });
});

describe('schema defaults', () => {
  test('use each accelerator once', () => {
    const defaults = shortcutActions.flatMap(defaultOf);
    const normalized = defaults.map(normalizeAccelerator);
    assert.equal(defaults.length, 5);
    assert.equal(new Set(normalized).size, normalized.length);
  });

  test('open the history with Super+AltGr+C and Super+Alt+C', () => {
    assert.deepEqual(defaultOf('open-history'), ['<Super><Mod5>c', '<Super><Alt>c']);
  });
});
