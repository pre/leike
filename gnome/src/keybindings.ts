import type Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { shortcutActions, type ShortcutAction } from './key-names.ts';

/**
 * Grabs the shortcut keys of the extension schema. Each key is of type "as":
 * Mutter grabs all accelerators in the list and calls the same handler for
 * each, and it grabs the new list when the setting changes. The handler gets
 * no key event, only (display, window, binding).
 */
export class Keybindings {
  private readonly added: ShortcutAction[] = [];

  constructor(settings: Gio.Settings, handlers: Record<ShortcutAction, () => void>) {
    for (const name of shortcutActions) {
      const action = Main.wm.addKeybinding(name, settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, Shell.ActionMode.NORMAL, () =>
        handlers[name](),
      );
      if (action === Meta.KeyBindingAction.NONE) {
        console.warn(`Leike: GNOME did not accept the ${name} shortcut ${JSON.stringify(settings.get_strv(name))}`);
      } else {
        this.added.push(name);
      }
    }
  }

  destroy(): void {
    for (const name of this.added.splice(0)) {
      Main.wm.removeKeybinding(name);
    }
  }
}
