import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk?version=4.0';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class LeikePreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: Adw.PreferencesWindow): void {
    const page = new Adw.PreferencesPage({
      title: 'Leike',
      icon_name: 'edit-paste-symbolic',
    });
    const group = new Adw.PreferencesGroup();
    group.add(new Gtk.Label({ label: 'Leike keeps your clipboard history. The settings come in a later version.', wrap: true }));
    page.add(group);
    window.add(page);
  }
}
