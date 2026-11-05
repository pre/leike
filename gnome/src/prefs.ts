import Adw from 'gi://Adw';
import type Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { acceleratorLabel, presentCaptureDialog } from './capture-dialog.ts';
import {
  conflictSections,
  findGnomeConflicts,
  rowConflicts,
  type KeybindingTables,
  type RowConflict,
} from './gnome-conflicts.ts';
import { gnomeKeybindingSettings, readGnomeKeybindings, removeFromGnome } from './gnome-keybindings.ts';
import { shortcutActions, type ShortcutAction } from './key-names.ts';
import { applicationsPage, gnomeNoteGroup, historyPage, resetAllButton, type Watch } from './prefs-groups.ts';
import { applyCapture, findConflict, shortcutSubtitles } from './shortcuts.ts';

export default class LeikePreferences extends ExtensionPreferences {
  override fillPreferencesWindow(window: Adw.PreferencesWindow): void {
    const settings = this.getSettings();
    // The handlers on settings objects, disconnected when the window closes.
    const connections: { settings: Gio.Settings; id: number }[] = [];
    const watch: Watch = (watched, signal, handler) => {
      connections.push({ settings: watched, id: watched.connect(signal, handler) });
    };
    window.add(shortcutsPage(window, settings, watch));
    window.add(historyPage(window, settings, watch));
    window.add(applicationsPage(window, settings, watch));
    window.connect('close-request', () => {
      connections.forEach(({ settings: watched, id }) => watched.disconnect(id));
      return false;
    });
  }
}

function shortcutsPage(window: Adw.PreferencesWindow, settings: Gio.Settings, watch: Watch): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({
    title: 'Shortcuts',
    icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
  });
  const gnomeSettings = gnomeKeybindingSettings();
  let gnomeTables = readGnomeKeybindings(gnomeSettings);
  const refreshers = new Map<ShortcutAction, (conflicts: readonly RowConflict[]) => void>();
  const refreshAll = (): void => {
    const bindings = currentBindings(settings);
    refreshers.forEach((refresh, action) => refresh(rowConflicts(action, bindings, gnomeTables)));
  };
  const reloadGnome = (): void => {
    gnomeTables = readGnomeKeybindings(gnomeSettings);
    refreshAll();
  };
  const removeConflict = (conflict: GnomeConflict): void => {
    try {
      removeFromGnome(conflict, conflict.accelerator);
    } catch (error) {
      window.add_toast(new Adw.Toast({ title: `Cannot remove the GNOME shortcut: ${error}`, timeout: 0 }));
    }
    reloadGnome();
  };

  const group = new Adw.PreferencesGroup({
    title: 'Keyboard Shortcuts',
    description: 'Click a shortcut to change it. A red sign shows that GNOME or another Leike action uses the same shortcut.',
    header_suffix: resetAllButton(window, settings),
  });
  for (const action of shortcutActions) {
    const { row, refresh } = shortcutRow(window, settings, action, { tables: () => gnomeTables, reload: reloadGnome }, removeConflict);
    refreshers.set(action, refresh);
    group.add(row);
  }
  page.add(group);
  page.add(gnomeNoteGroup());
  refreshAll();

  // A change of one shortcut can add or remove a conflict on other rows.
  watch(settings, 'changed', refreshAll);
  gnomeSettings.forEach((gnome) => watch(gnome, 'changed', reloadGnome));
  return page;
}

function actionTitle(settings: Gio.Settings, action: ShortcutAction): string {
  return settings.settings_schema.get_key(action).get_summary() ?? action;
}

type GnomeConflict = Extract<RowConflict, { kind: 'gnome' }>;

/** The GNOME keybindings that the page has read, and a way to read them again. */
interface GnomeTables {
  readonly tables: () => KeybindingTables;
  readonly reload: () => void;
}

/**
 * A red warning button that is visible when the row has conflicts. Its
 * popover lists them, with a remove button for each GNOME key.
 */
function conflictBadge(
  settings: Gio.Settings,
  removeConflict: (conflict: GnomeConflict) => void,
): { badge: Gtk.MenuButton; show: (conflicts: readonly RowConflict[]) => void } {
  const popover = new Gtk.Popover();
  const badge = new Gtk.MenuButton({
    icon_name: 'dialog-warning-symbolic',
    valign: Gtk.Align.CENTER,
    css_classes: ['flat', 'error'],
    popover,
  });
  const label = (text: string, cssClasses: string[] = []): Gtk.Label =>
    new Gtk.Label({ label: text, wrap: true, max_width_chars: 40, xalign: 0, css_classes: cssClasses });

  const show = (conflicts: readonly RowConflict[]): void => {
    badge.visible = conflicts.length > 0;
    const hasGnome = conflicts.some((conflict) => conflict.kind === 'gnome');
    badge.tooltip_text = hasGnome ? 'Conflicts with a GNOME shortcut' : 'Conflicts with another Leike shortcut';
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      margin_top: 6,
      margin_bottom: 6,
      margin_start: 6,
      margin_end: 6,
    });
    const gnomeConflicts = conflicts.filter((conflict) => conflict.kind === 'gnome');
    for (const section of conflictSections(gnomeConflicts, (conflict) => acceleratorLabel(conflict.accelerator))) {
      box.append(label(section.explanation, ['dim-label']));
      for (const { binding, wording } of section.entries) {
        box.append(label(wording.entry, ['heading']));
        const remove = new Gtk.Button({ label: wording.button, halign: Gtk.Align.START });
        remove.connect('clicked', () => {
          popover.popdown();
          removeConflict(binding);
        });
        box.append(remove);
      }
    }
    for (const conflict of conflicts) {
      if (conflict.kind === 'leike') {
        box.append(label(`Also used by Leike: ${actionTitle(settings, conflict.action)}`, ['heading']));
      }
    }
    popover.child = box;
  };
  return { badge, show };
}

function shortcutRow(
  window: Adw.PreferencesWindow,
  settings: Gio.Settings,
  action: ShortcutAction,
  gnome: GnomeTables,
  removeConflict: (conflict: GnomeConflict) => void,
): { row: Adw.ActionRow; refresh: (conflicts: readonly RowConflict[]) => void } {
  const title = actionTitle(settings, action);
  const row = new Adw.ActionRow({ title, subtitle: shortcutSubtitles[action], activatable: false });
  const label = new Gtk.Label({ justify: Gtk.Justification.RIGHT });
  const shortcut = new Gtk.Button({ child: label, valign: Gtk.Align.CENTER, tooltip_text: 'Set Shortcut' });
  const reset = new Gtk.Button({
    icon_name: 'edit-undo-symbolic',
    tooltip_text: 'Reset to Default',
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
  const { badge, show } = conflictBadge(settings, removeConflict);
  row.add_suffix(badge);
  row.add_suffix(shortcut);
  row.add_suffix(reset);

  const refresh = (conflicts: readonly RowConflict[]): void => {
    show(conflicts);
    const accelerators = settings.get_strv(action);
    const isEmpty = accelerators.length === 0;
    label.label = isEmpty ? 'Set shortcut…' : accelerators.map(acceleratorLabel).join('\n');
    label.css_classes = isEmpty ? ['dim-label'] : ['keycap'];
    const defaultValue = settings.get_default_value(action);
    reset.visible = defaultValue !== null && !settings.get_value(action).equal(defaultValue);
  };

  reset.connect('clicked', () => settings.reset(action));
  shortcut.connect('clicked', () =>
    presentCaptureDialog(window, {
      actionTitle: title,
      current: settings.get_strv(action),
      conflictOf: (accelerator) => {
        const other = findConflict(accelerator, action, currentBindings(settings));
        return other === null ? null : actionTitle(settings, other);
      },
      gnomeConflictsOf: (accelerator) => findGnomeConflicts(accelerator, gnome.tables()),
      removeFromGnome: (accelerator, bindings) => {
        bindings.forEach((binding) => removeFromGnome(binding, accelerator));
        gnome.reload();
      },
      onSave: (accelerator, mode) => {
        settings.set_strv(action, applyCapture(settings.get_strv(action), accelerator, mode));
        if (findGnomeConflicts(accelerator, gnome.tables()).length > 0) {
          window.add_toast(
            new Adw.Toast({
              title: `GNOME also uses ${acceleratorLabel(accelerator)}, so ${title} may not work.`,
              timeout: 0,
            }),
          );
        }
      },
    }),
  );
  return { row, refresh };
}

function currentBindings(settings: Gio.Settings): Map<ShortcutAction, readonly string[]> {
  return new Map(shortcutActions.map((action) => [action, settings.get_strv(action)]));
}
