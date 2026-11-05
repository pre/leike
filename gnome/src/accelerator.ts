/**
 * AltGr is the modifier Mod5 on a layout with level3(ralt_switch). Mutter
 * reads <Mod5> in an accelerator, but GTK 4 has no Mod5 and cannot parse
 * it. So the preferences window reads the accelerator text itself.
 */
export const altGrModifier = 'Mod5';

const modifierAliases: Readonly<Record<string, string>> = {
  control: 'Control',
  ctrl: 'Control',
  ctl: 'Control',
  primary: 'Control',
  alt: 'Alt',
  mod1: 'Alt',
  super: 'Super',
  mod4: 'Super',
  shift: 'Shift',
  shft: 'Shift',
  meta: 'Meta',
  hyper: 'Hyper',
  mod5: altGrModifier,
};

/**
 * The display names of the modifiers, in display order. Super comes first,
 * so the labels read as the README writes them, for example "Super AltGr C".
 */
const modifierLabels: readonly (readonly [string, string])[] = [
  ['Super', 'Super'],
  ['Hyper', 'Hyper'],
  ['Meta', 'Meta'],
  ['Control', 'Ctrl'],
  ['Alt', 'Alt'],
  [altGrModifier, 'AltGr'],
  ['Shift', 'Shift'],
];

export interface AcceleratorParts {
  /** The modifier names with the aliases resolved, for example Control for Primary. */
  readonly modifiers: readonly string[];
  /** The keysym name, for example "c" or "Page_Up". */
  readonly key: string;
}

export function splitAccelerator(accelerator: string): AcceleratorParts {
  const modifiers = new Set<string>();
  const key = accelerator.trim().replace(/<([^>]+)>/g, (_, name: string) => {
    const lower = name.toLowerCase();
    modifiers.add(modifierAliases[lower] ?? lower);
    return '';
  });
  return { modifiers: [...modifiers], key: key.trim() };
}

/**
 * Gives one spelling for accelerators that GTK and Mutter treat as the
 * same: sorted modifiers with aliases resolved, and a key of one letter in
 * lower case. An empty string stays empty.
 */
export function normalizeAccelerator(accelerator: string): string {
  const { modifiers, key } = splitAccelerator(accelerator);
  const modifierText = [...modifiers].sort().map((modifier) => `<${modifier}>`);
  return [...modifierText, key.length === 1 ? key.toLowerCase() : key].join('');
}

/**
 * True when the accelerator has a modifier other than Shift and AltGr. A
 * global shortcut without one would take a key that the user types in text.
 */
export function hasCommandModifier(accelerator: string): boolean {
  return /<(Control|Alt|Super|Meta|Hyper)>/.test(normalizeAccelerator(accelerator));
}

/** The display names of the modifiers of the accelerator, for example ["Super", "AltGr"]. */
export function modifierLabelsOf(accelerator: string): string[] {
  const { modifiers } = splitAccelerator(accelerator);
  return modifierLabels.filter(([name]) => modifiers.includes(name)).map(([, label]) => label);
}

/**
 * The shift level of a key press without AltGr. On a layout with a level 3
 * key, levels 2 and 3 (counted from 0) are the levels that AltGr selects.
 */
export function withoutAltGrLevel(level: number): { altGr: boolean; level: number } {
  return level >= 2 ? { altGr: true, level: level - 2 } : { altGr: false, level };
}

/** Adds <Mod5> (AltGr) to an accelerator that GTK named without it. */
export function addAltGr(accelerator: string): string {
  if (accelerator === '' || splitAccelerator(accelerator).modifiers.includes(altGrModifier)) {
    return accelerator;
  }
  return `<${altGrModifier}>${accelerator}`;
}

/** GTK shows the keysym name for these keys. */
const keyLabelFixes: Readonly<Record<string, string>> = { BackSpace: 'Backspace' };

/**
 * The display text of an accelerator, for example "Super AltGr C", or
 * "Disabled". `keyLabel` gives the label of a keysym name; the preferences
 * window uses GTK for it.
 */
export function acceleratorText(accelerator: string, keyLabel: (key: string) => string): string {
  if (accelerator === '') {
    return 'Disabled';
  }
  const label = keyLabel(splitAccelerator(accelerator).key);
  return [...modifierLabelsOf(accelerator), keyLabelFixes[label] ?? label].join(' ');
}
