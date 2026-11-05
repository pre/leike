import { normalizeAccelerator } from './accelerator.ts';
import type { ShortcutAction } from './key-names.ts';

/** Schema id -> key -> accelerators. Only keys of type `as`. */
export type KeybindingTables = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

export interface GnomeBinding {
  readonly schema: string;
  readonly key: string;
}

/** The GNOME schemas that have keybindings, with a name for the user. */
export const gnomeKeybindingSchemas: ReadonlyMap<string, string> = new Map([
  ['org.gnome.desktop.wm.keybindings', 'Window Manager'],
  ['org.gnome.mutter.keybindings', 'Mutter'],
  ['org.gnome.mutter.wayland.keybindings', 'Mutter Wayland'],
  ['org.gnome.shell.keybindings', 'Shell'],
  ['org.gnome.settings-daemon.plugins.media-keys', 'Media Keys'],
  ['org.freedesktop.ibus.panel.emoji', 'IBus emoji'],
]);

export function schemaShortName(schema: string): string {
  return gnomeKeybindingSchemas.get(schema) ?? schema;
}

/** The schema name for the preferences window, for example "Mutter keybindings". */
export function schemaTitle(schema: string): string {
  if (!gnomeKeybindingSchemas.has(schema) || !schema.endsWith('.keybindings')) {
    return schemaShortName(schema);
  }
  return `${schemaShortName(schema)} keybindings`;
}

/** A shortcut that the action shares with a GNOME key or another Leike action. */
export type RowConflict =
  | { readonly kind: 'gnome'; readonly schema: string; readonly key: string; readonly accelerator: string }
  | { readonly kind: 'leike'; readonly action: ShortcutAction; readonly accelerator: string };

/**
 * The conflicts of each accelerator of the action: first the GNOME keys,
 * then the other Leike actions that use it.
 */
export function rowConflicts(
  action: ShortcutAction,
  bindings: ReadonlyMap<ShortcutAction, readonly string[]>,
  gnome: KeybindingTables,
): RowConflict[] {
  const conflicts: RowConflict[] = [];
  for (const accelerator of bindings.get(action) ?? []) {
    for (const binding of findGnomeConflicts(accelerator, gnome)) {
      conflicts.push({ kind: 'gnome', ...binding, accelerator });
    }
    const wanted = normalizeAccelerator(accelerator);
    for (const [other, accelerators] of bindings) {
      if (other !== action && accelerators.some((value) => normalizeAccelerator(value) === wanted)) {
        conflicts.push({ kind: 'leike', action: other, accelerator });
      }
    }
  }
  return conflicts;
}

/** The GNOME keys that have the accelerator as one of their entries. */
export function findGnomeConflicts(accelerator: string, tables: KeybindingTables): GnomeBinding[] {
  if (accelerator === '') {
    return [];
  }
  const wanted = normalizeAccelerator(accelerator);
  const conflicts: GnomeBinding[] = [];
  for (const [schema, keys] of tables) {
    for (const [key, accelerators] of keys) {
      if (accelerators.some((value) => normalizeAccelerator(value) === wanted)) {
        conflicts.push({ schema, key });
      }
    }
  }
  return conflicts;
}

export function withoutAccelerator(accelerators: readonly string[], accelerator: string): string[] {
  const wanted = normalizeAccelerator(accelerator);
  return accelerators.filter((value) => normalizeAccelerator(value) !== wanted);
}

/** The texts that the preferences window shows for a GNOME key that uses a Leike shortcut. */
export interface ConflictWording {
  /** What happens to the shortcut. The keys with the same explanation share one section. */
  readonly explanation: string;
  readonly entry: string;
  readonly button: string;
}

const ibusEmojiSchema = 'org.freedesktop.ibus.panel.emoji';

/** The IBus hotkey that opens the emoji picker. */
export function isIbusEmojiPicker(binding: GnomeBinding): boolean {
  return binding.schema === ibusEmojiSchema && binding.key === 'hotkey';
}

/** Names for the GNOME keys that conflict with the Leike defaults. */
const gnomeKeyNames: ReadonlyMap<string, string> = new Map([
  ['org.gnome.shell.keybindings toggle-message-tray', 'Show the notification list'],
]);

/** The name of the GNOME key for the user, for example "Shell keybindings › toggle-message-tray". */
export function gnomeKeyTitle(binding: GnomeBinding): string {
  const name = gnomeKeyNames.get(`${binding.schema} ${binding.key}`);
  const title = `${schemaTitle(binding.schema)} › ${binding.key}`;
  return name === undefined ? title : `${name} (${title})`;
}

/** The texts for the key. `shortcut` is the display text of the accelerator, for example "Super V". */
export function conflictWording(binding: GnomeBinding, shortcut: string): ConflictWording {
  if (isIbusEmojiPicker(binding)) {
    return {
      explanation:
        'IBus opens its emoji picker with this shortcut before Leike sees it. ' +
        'In terminals the text turns underlined until you press Esc.',
      entry: `IBus emoji picker (${shortcut})`,
      button: 'Turn off the IBus emoji shortcut',
    };
  }
  return {
    explanation: 'GNOME handles this shortcut before Leike. Remove it from GNOME to let Leike use it.',
    entry: `${gnomeKeyTitle(binding)}: ${shortcut}`,
    button: 'Remove from GNOME',
  };
}

export interface ConflictSection<T extends GnomeBinding> {
  readonly explanation: string;
  readonly entries: readonly { readonly binding: T; readonly wording: ConflictWording }[];
}

/** Groups the keys by explanation, in the order of the first key of each group. */
export function conflictSections<T extends GnomeBinding>(
  bindings: readonly T[],
  shortcutOf: (binding: T) => string,
): ConflictSection<T>[] {
  const sections = new Map<string, { binding: T; wording: ConflictWording }[]>();
  for (const binding of bindings) {
    const wording = conflictWording(binding, shortcutOf(binding));
    const entries = sections.get(wording.explanation) ?? [];
    entries.push({ binding, wording });
    sections.set(wording.explanation, entries);
  }
  return [...sections].map(([explanation, entries]) => ({ explanation, entries }));
}
