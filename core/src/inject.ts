export type ClipboardAction = 'copy' | 'paste' | 'cut';

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

/** Terminals take Ctrl+Shift+C/V/X. A null wmClass (no focused window) is not a terminal. */
export function keysFor(
  action: ClipboardAction,
  wmClass: string | null,
  terminalWmClasses: readonly string[],
): KeyChord {
  return { shift: isTerminal(wmClass, terminalWmClasses), key: actionKeys[action] };
}

function isTerminal(wmClass: string | null, terminalWmClasses: readonly string[]): boolean {
  if (wmClass === null) {
    return false;
  }
  const wanted = wmClass.toLowerCase();
  return terminalWmClasses.some((terminal) => terminal.toLowerCase() === wanted);
}
