import type { ClipboardAction } from '@leike/core';

/**
 * The actions that have a keybinding. The name of an action is also the
 * name of its gsettings key. Mutter keeps all keybinding names in one
 * namespace, and none of its own keybindings has one of these names.
 */
export type ShortcutAction = ClipboardAction | 'open-history';

/** The keybinding actions, in the order of the preferences window. */
export const shortcutActions: readonly ShortcutAction[] = ['copy', 'paste', 'cut', 'open-history'];
