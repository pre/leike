import type { KeyChord } from '@leike/core';

/** A key name as in Clutter.KEY_<name>, and true for a press or false for a release. */
export type KeyEvent = [name: string, pressed: boolean];

/** Ctrl down, Shift down when the chord has it, the key down and up, then the modifiers up in reverse order. */
export function keySequence(chord: KeyChord): KeyEvent[] {
  const modifiers = chord.shift ? ['Control_L', 'Shift_L'] : ['Control_L'];
  return [
    ...modifiers.map((name): KeyEvent => [name, true]),
    [chord.key, true],
    [chord.key, false],
    ...modifiers.reverse().map((name): KeyEvent => [name, false]),
  ];
}
