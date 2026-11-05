export type ClipboardAction = 'copy' | 'paste' | 'cut';

/** The key combination that the injector sends: Ctrl, Shift when set, and the key. */
export interface KeyChord {
  shift: boolean;
  key: 'c' | 'v' | 'x';
}

export function keysFor(
  _action: ClipboardAction,
  _wmClass: string | null,
  _terminalWmClasses: readonly string[],
): KeyChord {
  throw new Error('not implemented');
}
