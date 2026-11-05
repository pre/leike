import type Gio from 'gi://Gio';
import type { Settings } from '@leike/core';

/** Reads the core settings from the extension schema. Call it at each use, so changes apply at once. */
export function readSettings(settings: Gio.Settings): Settings {
  return {
    maxEntries: settings.get_int('max-entries'),
    maxImageBytes: settings.get_int('max-image-bytes'),
    terminalWmClasses: settings.get_strv('terminal-wm-classes'),
    blocklistWmClasses: settings.get_strv('blocklist-wm-classes'),
  };
}
