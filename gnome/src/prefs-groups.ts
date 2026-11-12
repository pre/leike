import Adw from 'gi://Adw';
import type Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import { clearHistory } from './clear-history.ts';
import { historyFile } from './data-paths.ts';
import { shortcutActions } from './key-names.ts';
import {
  addWmClass,
  bytesToKiB,
  bytesToMiB,
  kibToBytes,
  maxEntriesRange,
  maxImageMiBRange,
  maxTextKiBRange,
  mibToBytes,
  removeWmClass,
  rowChanges,
} from './prefs-values.ts';

/** Connects a handler that the preferences window disconnects when it closes. */
export type Watch = (settings: Gio.Settings, signal: string, handler: () => void) => void;

/** Asks before a destructive change and calls `onConfirm` when the user agrees. */
function confirm(window: Adw.PreferencesWindow, heading: string, body: string, button: string, onConfirm: () => void): void {
  const dialog = new Adw.AlertDialog({ heading, body, close_response: 'cancel' });
  dialog.add_response('cancel', 'Cancel');
  dialog.add_response('confirm', button);
  dialog.set_response_appearance('confirm', Adw.ResponseAppearance.DESTRUCTIVE);
  dialog.connect('response', (_dialog, response) => {
    if (response === 'confirm') {
      onConfirm();
    }
  });
  dialog.present(window);
}

export function resetAllButton(window: Adw.PreferencesWindow, settings: Gio.Settings): Gtk.Button {
  const resetAll = new Gtk.Button({ label: 'Reset All', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
  resetAll.connect('clicked', () =>
    confirm(window, 'Reset All Shortcuts?', 'All Leike shortcuts get their default values again.', 'Reset All', () =>
      shortcutActions.forEach((action) => settings.reset(action)),
    ),
  );
  return resetAll;
}

export function gnomeNoteGroup(): Adw.PreferencesGroup {
  const group = new Adw.PreferencesGroup({ title: 'Keyboard Shortcuts in Use by GNOME' });
  const text = new Gtk.Label({
    label:
      'GNOME has its own shortcuts. By default, GNOME uses Super+V to show the notification list, the same as Leike paste. ' +
      'GNOME gets the key first, so Leike cannot paste with Super+V until you remove it from GNOME. ' +
      'Click the red sign on the row and then Remove from GNOME. GNOME keeps Super+M for the notification list.\n\n' +
      'To get a GNOME shortcut back, open Settings > Keyboard > View and Customize Shortcuts and reset it.',
    wrap: true,
    xalign: 0,
  });
  group.add(text);
  return group;
}

/**
 * A SpinRow that shows a byte setting in a larger unit. A plain bind cannot
 * convert the value, so the row and the setting update each other.
 */
function sizeRow(
  settings: Gio.Settings,
  watch: Watch,
  key: string,
  range: { min: number; max: number; step: number },
  fromBytes: (bytes: number) => number,
  toBytes: (value: number) => number,
): Adw.SpinRow {
  const row = Adw.SpinRow.new_with_range(range.min, range.max, range.step);
  const sync = (): void => {
    row.value = fromBytes(settings.get_int(key));
  };
  sync();
  watch(settings, `changed::${key}`, sync);
  row.connect('notify::value', () => {
    if (fromBytes(settings.get_int(key)) !== row.value) {
      settings.set_int(key, toBytes(row.value));
    }
  });
  return row;
}

export function historyPage(window: Adw.PreferencesWindow, settings: Gio.Settings, watch: Watch): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({ title: 'History', icon_name: 'document-open-recent-symbolic' });

  const limits = new Adw.PreferencesGroup({ title: 'Limits' });
  const maxEntries = Adw.SpinRow.new_with_range(maxEntriesRange.min, maxEntriesRange.max, maxEntriesRange.step);
  maxEntries.title = 'Maximum number of entries';
  maxEntries.subtitle = 'When the history is full, Leike removes the oldest entry that is not pinned';
  settings.bind('max-entries', maxEntries, 'value', Gio.SettingsBindFlags.DEFAULT);

  const maxImage = sizeRow(settings, watch, 'max-image-bytes', maxImageMiBRange, bytesToMiB, mibToBytes);
  maxImage.title = 'Maximum image size (MiB)';
  maxImage.subtitle = 'Leike does not keep a larger image';

  const maxText = sizeRow(settings, watch, 'max-text-bytes', maxTextKiBRange, bytesToKiB, kibToBytes);
  maxText.title = 'Maximum text size (KiB)';
  maxText.subtitle = 'Leike does not keep a larger text';
  limits.add(maxEntries);
  limits.add(maxImage);
  limits.add(maxText);
  page.add(limits);

  const userDataDir = GLib.get_user_data_dir();
  const data = new Adw.PreferencesGroup({ title: 'Data' });
  const clearRow = new Adw.ActionRow({
    title: 'Clear history',
    subtitle: `Removes all entries and images, also the pinned entries. The history is in ${GLib.path_get_dirname(historyFile(userDataDir))}`,
    subtitle_selectable: true,
  });
  const clear = new Gtk.Button({ label: 'Clear…', valign: Gtk.Align.CENTER, css_classes: ['destructive-action'] });
  clear.connect('clicked', () =>
    confirm(
      window,
      'Clear the History?',
      'Leike removes all entries and images, also the pinned entries. You cannot undo this.',
      'Clear History',
      () => {
        try {
          clearHistory(userDataDir);
          window.add_toast(new Adw.Toast({ title: 'The history is clear.' }));
        } catch (error) {
          window.add_toast(new Adw.Toast({ title: `Cannot clear the history: ${error}`, timeout: 0 }));
        }
      },
    ),
  );
  clearRow.add_suffix(clear);
  data.add(clearRow);
  page.add(data);
  return page;
}

export function applicationsPage(window: Adw.PreferencesWindow, settings: Gio.Settings, watch: Watch): Adw.PreferencesPage {
  const page = new Adw.PreferencesPage({ title: 'Applications', icon_name: 'application-x-executable-symbolic' });
  const about = new Adw.PreferencesGroup({
    description:
      'Leike finds an application by the WM_CLASS of its window. To see the WM_CLASS of a window, ' +
      'press Alt+F2, type lg, press Enter and open the Windows tab.',
  });
  page.add(about);
  page.add(
    wmClassGroup(window, settings, watch, {
      key: 'terminal-wm-classes',
      title: 'Terminal Applications',
      description:
        'Copy, paste and cut send Ctrl+Shift+C, V and X to these applications, and Ctrl+C, V and X to all other applications. ' +
        'When the clipboard has an image, paste sends Ctrl+V to all applications.',
    }),
  );
  page.add(
    wmClassGroup(window, settings, watch, {
      key: 'blocklist-wm-classes',
      title: 'Blocked Applications',
      description: 'Leike does not keep what you copy in these applications, for example in a password manager.',
    }),
  );
  return page;
}

interface WmClassList {
  readonly key: string;
  readonly title: string;
  readonly description: string;
}

/** Gives the keyboard focus to the widget. The page does not scroll to it. */
function focusInPlace(widget: Gtk.Widget): void {
  const viewport = widget.get_ancestor(Gtk.Viewport.$gtype) as Gtk.Viewport;
  viewport.scroll_to_focus = false;
  widget.grab_focus();
  viewport.scroll_to_focus = true;
}

/**
 * Scrolls the page down when a new row moved the widget below the visible
 * part. GTK places the rows in the layout step of the next frame, so the
 * check runs after that step.
 */
function keepInView(widget: Gtk.Widget): void {
  const scrolled = widget.get_ancestor(Gtk.ScrolledWindow.$gtype) as Gtk.ScrolledWindow;
  const clock = widget.get_frame_clock() as Gdk.FrameClock;
  const id = clock.connect_after('layout', () => {
    clock.disconnect(id);
    const [, bounds] = widget.compute_bounds(scrolled);
    const below = bounds.get_y() + bounds.get_height() - scrolled.get_height();
    if (below > 0) {
      scrolled.vadjustment.value += below;
    }
  });
}

/** A list of WM_CLASS values with a remove button on each row and an entry row that adds one. */
function wmClassGroup(
  window: Adw.PreferencesWindow,
  settings: Gio.Settings,
  watch: Watch,
  list: WmClassList,
): Adw.PreferencesGroup {
  const reset = new Gtk.Button({
    icon_name: 'edit-undo-symbolic',
    tooltip_text: 'Reset to Default',
    valign: Gtk.Align.CENTER,
    css_classes: ['flat'],
  });
  reset.connect('clicked', () =>
    confirm(window, `Reset ${list.title}?`, 'The list gets its default values again.', 'Reset', () =>
      settings.reset(list.key),
    ),
  );
  const group = new Adw.PreferencesGroup({ title: list.title, description: list.description, header_suffix: reset });

  const entry = new Adw.EntryRow({ title: 'Add WM_CLASS', show_apply_button: true });
  entry.connect('apply', () => {
    const result = addWmClass(settings.get_strv(list.key), entry.text);
    if (result.list === null) {
      window.add_toast(new Adw.Toast({ title: result.problem }));
      return;
    }
    settings.set_strv(list.key, result.list);
    entry.text = '';
  });

  group.add(entry);
  // The group can add a row only at the end. Its list box can put a row before the entry row.
  const listBox = entry.get_parent() as Gtk.ListBox;

  const wmClassRow = (wmClass: string): Adw.ActionRow => {
    const row = new Adw.ActionRow({ title: wmClass, title_selectable: true });
    const remove = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      tooltip_text: 'Remove',
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    });
    remove.connect('clicked', () => settings.set_strv(list.key, removeWmClass(settings.get_strv(list.key), wmClass)));
    row.add_suffix(remove);
    return row;
  };

  // Only the rows that change go out and come in, so the entry row keeps the keyboard focus.
  let rows: Adw.ActionRow[] = [];
  const sync = (): void => {
    const { remove, insert } = rowChanges(
      rows.map((row) => row.title),
      settings.get_strv(list.key),
    );
    const gone = rows.filter((_, index) => remove.includes(index));
    gone.forEach((row) => {
      // GTK gives the focus of a removed row to the first row and scrolls to it. The next row gets it here.
      const focus = window.get_focus();
      if (focus === row || focus?.is_ancestor(row)) {
        focusInPlace(row.get_next_sibling() ?? entry);
      }
      listBox.remove(row);
    });
    rows = rows.filter((row) => !gone.includes(row));
    insert.forEach(([index, wmClass]) => {
      const row = wmClassRow(wmClass);
      listBox.insert(row, index);
      rows.splice(index, 0, row);
    });
    if (insert.length > 0 && window.get_focus()?.is_ancestor(entry)) {
      keepInView(entry);
    }
    const defaultValue = settings.get_default_value(list.key);
    reset.visible = defaultValue !== null && !settings.get_value(list.key).equal(defaultValue);
  };
  sync();
  watch(settings, `changed::${list.key}`, sync);
  return group;
}
