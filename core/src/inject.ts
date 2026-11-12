export type ClipboardAction = 'copy' | 'paste' | 'cut';

/** The kind of the clipboard content when the keys go out. Only paste looks at it. */
export type ClipboardContent = 'image' | 'text';

/** The key combination that the injector sends: Ctrl, Shift when set, and the key. */
export interface KeyChord {
  shift: boolean;
  key: 'c' | 'v' | 'x';
}

const actionKeys: Record<ClipboardAction, KeyChord['key']> = {
  copy: 'c',
  paste: 'v',
  cut: 'x',
};

/**
 * Terminals take Ctrl+Shift+C/V/X. An image paste into a terminal is Ctrl+V:
 * the paste of a terminal gives only text, and a program in the terminal
 * reads the image from the clipboard when it gets Ctrl+V (ADR-0016).
 * A null wmClass (no focused window) is not a terminal.
 */
export function keysFor(
  action: ClipboardAction,
  wmClass: string | null,
  terminalWmClasses: readonly string[],
  content: ClipboardContent,
): KeyChord {
  const imagePaste = action === 'paste' && content === 'image';
  return { shift: isTerminal(wmClass, terminalWmClasses) && !imagePaste, key: actionKeys[action] };
}

function isTerminal(wmClass: string | null, terminalWmClasses: readonly string[]): boolean {
  if (wmClass === null) {
    return false;
  }
  const wanted = wmClass.toLowerCase();
  return terminalWmClasses.some((terminal) => terminal.toLowerCase() === wanted);
}
