import type { KeyChord } from '@leike/core';

export type Modifier = 'Shift' | 'Control' | 'Alt' | 'Super';

/** A key name as in Clutter.KEY_<name>. */
export type KeyName = `${Modifier}_${'L' | 'R'}` | KeyChord['key'];

/** A key and true for a press or false for a release. */
export type KeyEvent = [name: KeyName, pressed: boolean];

/**
 * The keys that the application gets while the modifiers of a shortcut are
 * physically down. `held` are the modifiers at the key press of the shortcut,
 * `down` those that are down now.
 *
 * The application gets the release of both keys of each held modifier, then
 * the chord, then a press of the left key of each held modifier that is still
 * down. The release of the letter is last: Mutter opens the overview when a
 * Super press is the last key before the Super release.
 */
export function keySequence(chord: KeyChord, held: readonly Modifier[], down: readonly Modifier[]): KeyEvent[] {
  const chordModifiers: KeyName[] = chord.shift ? ['Control_L', 'Shift_L'] : ['Control_L'];
  return [
    ...held.flatMap((modifier): KeyEvent[] => [
      [`${modifier}_L`, false],
      [`${modifier}_R`, false],
    ]),
    ...chordModifiers.map((name): KeyEvent => [name, true]),
    [chord.key, true],
    ...chordModifiers.reverse().map((name): KeyEvent => [name, false]),
    ...held.filter((modifier) => down.includes(modifier)).map((modifier): KeyEvent => [`${modifier}_L`, true]),
    [chord.key, false],
  ];
}

// XKB key codes (the evdev code + 8) of a PC keyboard. The letters are at their QWERTY positions.
const keyCodes: Readonly<Record<KeyName, number>> = {
  Shift_L: 50,
  Shift_R: 62,
  Control_L: 37,
  Control_R: 105,
  Alt_L: 64,
  Alt_R: 108,
  Super_L: 133,
  Super_R: 134,
  c: 54,
  v: 55,
  x: 53,
};

/** The key that the user pressed for the shortcut: its character and its key code. */
export interface PressedKey {
  unicode: string;
  code: number;
}

/**
 * The key code for a forwarded key. Mutter has no call for JavaScript that
 * gives the key code of a key name in the active layout. The pressed key of
 * the shortcut gives the code of its own letter, so Super+V sends the correct
 * V on each layout. All other keys use the table.
 */
export function keyCode(name: KeyName, pressed: PressedKey | null): number {
  return pressed?.unicode.toLowerCase() === name ? pressed.code : keyCodes[name];
}
