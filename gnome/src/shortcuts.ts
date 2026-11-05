import { hasCommandModifier, normalizeAccelerator } from './accelerator.ts';
import type { ShortcutAction } from './key-names.ts';

/** The text under the title of each shortcut row. */
export const shortcutSubtitles: Readonly<Record<ShortcutAction, string>> = {
  copy: 'Sends Ctrl+C, or Ctrl+Shift+C to a terminal',
  paste: 'Sends Ctrl+V, or Ctrl+Shift+V to a terminal',
  cut: 'Sends Ctrl+X, or Ctrl+Shift+X to a terminal',
  'open-history': 'Opens the clipboard history',
};

/**
 * Why the accelerator that the capture dialog got cannot be used, or null.
 * `conflictOf` gives the title of the other action that uses it, or null.
 */
export function captureProblem(accelerator: string, conflictOf: (accelerator: string) => string | null): string | null {
  if (accelerator !== '' && !hasCommandModifier(accelerator)) {
    return 'Use at least one of Ctrl, Alt or Super.';
  }
  const conflict = conflictOf(accelerator);
  return conflict === null ? null : `${conflict} already uses this shortcut.`;
}

/** The other action that already uses the accelerator, or null. */
export function findConflict(
  accelerator: string,
  action: ShortcutAction,
  bindings: ReadonlyMap<ShortcutAction, readonly string[]>,
): ShortcutAction | null {
  if (accelerator === '') {
    return null;
  }
  const wanted = normalizeAccelerator(accelerator);
  for (const [other, accelerators] of bindings) {
    if (other !== action && accelerators.some((value) => normalizeAccelerator(value) === wanted)) {
      return other;
    }
  }
  return null;
}

/**
 * The accelerators of an action after the capture dialog: "set" replaces
 * them all, "add" adds one more. The empty accelerator disables the action.
 */
export function applyCapture(current: readonly string[], accelerator: string, mode: 'set' | 'add'): string[] {
  if (accelerator === '') {
    return [];
  }
  if (mode === 'set') {
    return [accelerator];
  }
  const wanted = normalizeAccelerator(accelerator);
  return current.some((value) => normalizeAccelerator(value) === wanted) ? [...current] : [...current, accelerator];
}
