import Gio from 'gi://Gio';
import { gnomeKeybindingSchemas, withoutAccelerator, type GnomeBinding, type KeybindingTables } from './gnome-conflicts.ts';

/** The settings of the GNOME keybinding schemas that are installed. */
export function gnomeKeybindingSettings(): Gio.Settings[] {
  const source = Gio.SettingsSchemaSource.get_default();
  return [...gnomeKeybindingSchemas.keys()]
    .map((id) => source?.lookup(id, true))
    .filter((schema) => schema !== null && schema !== undefined)
    .map((schema) => new Gio.Settings({ settings_schema: schema }));
}

/** Reads the `as` keys of the GNOME keybinding schemas. */
export function readGnomeKeybindings(settingsList = gnomeKeybindingSettings()): KeybindingTables {
  const tables = new Map<string, Map<string, string[]>>();
  for (const settings of settingsList) {
    const schema = settings.settings_schema;
    const keys = new Map<string, string[]>();
    for (const key of schema.list_keys()) {
      if (schema.get_key(key).get_value_type().dup_string() === 'as') {
        keys.set(key, settings.get_strv(key));
      }
    }
    tables.set(schema.get_id(), keys);
  }
  return tables;
}

/**
 * Removes the accelerator from the GNOME key and keeps the other entries.
 * `gsettings reset <schema> <key>` gives the GNOME default back.
 */
export function removeFromGnome(binding: GnomeBinding, accelerator: string): void {
  const settings = new Gio.Settings({ schema_id: binding.schema });
  settings.set_strv(binding.key, withoutAccelerator(settings.get_strv(binding.key), accelerator));
}
