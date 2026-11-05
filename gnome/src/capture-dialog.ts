import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import { acceleratorText, addAltGr, withoutAltGrLevel } from './accelerator.ts';
import { conflictWording, isIbusEmojiPicker, schemaShortName, type GnomeBinding } from './gnome-conflicts.ts';
import { captureProblem } from './shortcuts.ts';

export interface CaptureRequest {
  readonly actionTitle: string;
  readonly current: readonly string[];
  /** The title of the other action that uses the accelerator, or null. */
  readonly conflictOf: (accelerator: string) => string | null;
  /** The GNOME keys that use the accelerator. */
  readonly gnomeConflictsOf: (accelerator: string) => readonly GnomeBinding[];
  /** Removes the accelerator from these GNOME keys. Throws on failure. */
  readonly removeFromGnome: (accelerator: string, bindings: readonly GnomeBinding[]) => void;
  /**
   * Gets the new accelerator, or '' to disable the action. "set" replaces
   * the accelerators of the action, "add" adds one more.
   */
  readonly onSave: (accelerator: string, mode: 'set' | 'add') => void;
}

/** The display text of an accelerator, for example "Super AltGr C", or "Disabled". */
export function acceleratorLabel(accelerator: string): string {
  return acceleratorText(accelerator, (key) => {
    const keyval = Gdk.keyval_from_name(key);
    return keyval === Gdk.KEY_VoidSymbol ? key : Gtk.accelerator_get_label(keyval, 0);
  });
}

function inhibitStateText(inhibited: boolean): string {
  return inhibited
    ? 'System shortcuts are paused, press your combination.'
    : 'GNOME did not pause its shortcuts. If your key press does not appear here, GNOME already uses it. ' +
        'Remove it in Settings > Keyboard, then try again.';
}

/**
 * The accelerator of a key press. GTK 4 does not name AltGr, and with
 * AltGr the keyval is the symbol of level 3, for example © for C. So the
 * accelerator gets the keyval of the same key without AltGr, and <Mod5>.
 */
function capturedAccelerator(event: Gdk.KeyEvent | null, keyval: number, keycode: number, modifiers: number): string {
  const { altGr, level } = withoutAltGrLevel(event?.get_level() ?? 0);
  if (!altGr || event === null) {
    return Gtk.accelerator_name(Gdk.keyval_to_lower(keyval), modifiers);
  }
  const [, keys, keyvals] = event.get_display()?.map_keycode(keycode) ?? [false, [], []];
  const index = (keys ?? []).findIndex((key) => key.group === event.get_layout() && key.level === level);
  const baseKeyval = index >= 0 ? (keyvals?.[index] ?? keyval) : keyval;
  return addAltGr(Gtk.accelerator_name(Gdk.keyval_to_lower(baseKeyval), modifiers));
}

/**
 * Shows a dialog that records the next key combination. Escape cancels,
 * BackSpace disables the action. The value is saved only when the user
 * clicks Set or Add.
 */
export function presentCaptureDialog(parent: Gtk.Widget, request: CaptureRequest): void {
  const shortcut = new Gtk.Label({
    label: request.current.length === 0 ? 'Disabled' : request.current.map(acceleratorLabel).join(', '),
    css_classes: ['title-2'],
    wrap: true,
  });
  const hint = new Gtk.Label({
    label: 'If the keys you press do not appear, the shortcut is probably already in use.',
    wrap: true,
    css_classes: ['dim-label'],
  });
  const inhibitState = new Gtk.Label({ label: inhibitStateText(false), wrap: true, css_classes: ['dim-label'] });
  const problem = new Gtk.Label({ wrap: true, css_classes: ['error'], visible: false });
  const gnomeBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, visible: false });
  const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12 });
  [shortcut, hint, inhibitState, problem, gnomeBox].forEach((widget) => content.append(widget));

  const dialog = new Adw.AlertDialog({
    heading: `Set Shortcut for ${request.actionTitle}`,
    body:
      'Press the new key combination. Press Escape to cancel, or BackSpace to disable the action. ' +
      'Set replaces the shortcuts of the action. Add keeps them and adds the new one.',
    extra_child: content,
    close_response: 'cancel',
  });
  dialog.add_response('cancel', 'Cancel');
  dialog.add_response('add', 'Add');
  dialog.add_response('set', 'Set');
  dialog.set_response_appearance('set', Adw.ResponseAppearance.SUGGESTED);
  dialog.set_response_enabled('add', false);
  dialog.set_response_enabled('set', false);

  let pending: string | null = null;
  // One section for the IBus emoji picker and one for the other GNOME
  // keys, each with a button that removes only its own keys.
  const showGnomeUse = (accelerator: string): void => {
    for (let child = gnomeBox.get_first_child(); child !== null; child = gnomeBox.get_first_child()) {
      gnomeBox.remove(child);
    }
    const bindings = request.gnomeConflictsOf(accelerator);
    const [ibus] = bindings.filter(isIbusEmojiPicker);
    const gnome = bindings.filter((binding) => !isIbusEmojiPicker(binding));
    if (ibus !== undefined) {
      const wording = conflictWording(ibus, acceleratorLabel(accelerator));
      addSection(accelerator, [ibus], [wording.explanation, wording.entry], wording.button);
    }
    if (gnome.length > 0) {
      const used = gnome.map((b) => `Used by GNOME: ${schemaShortName(b.schema)} ${b.key}`);
      addSection(accelerator, gnome, used, 'Remove from GNOME');
    }
    gnomeBox.visible = bindings.length > 0;
  };
  const addSection = (
    accelerator: string,
    bindings: readonly GnomeBinding[],
    lines: readonly string[],
    buttonLabel: string,
  ): void => {
    const text = new Gtk.Label({ label: lines.join('\n'), wrap: true, css_classes: ['warning'] });
    const button = new Gtk.Button({ label: buttonLabel, halign: Gtk.Align.CENTER });
    button.connect('clicked', () => {
      try {
        request.removeFromGnome(accelerator, bindings);
        showGnomeUse(accelerator);
      } catch (error) {
        text.label = `Cannot remove the shortcut: ${error}`;
        button.visible = false;
      }
    });
    gnomeBox.append(text);
    gnomeBox.append(button);
  };
  const offer = (accelerator: string): void => {
    const reason = captureProblem(accelerator, request.conflictOf);
    shortcut.label = acceleratorLabel(accelerator);
    problem.label = reason ?? '';
    problem.visible = reason !== null;
    pending = reason === null ? accelerator : null;
    dialog.set_response_enabled('set', pending !== null);
    dialog.set_response_enabled('add', pending !== null && pending !== '' && request.current.length > 0);
    showGnomeUse(accelerator);
  };

  // The capture phase gets the keys before the buttons of the dialog do.
  const keys = new Gtk.EventControllerKey({ propagation_phase: Gtk.PropagationPhase.CAPTURE });
  keys.connect('key-pressed', (controller, keyval, keycode, state) => {
    const modifiers = state & Gtk.accelerator_get_default_mod_mask();
    const key = Gdk.keyval_to_lower(keyval);
    if (modifiers === 0 && key === Gdk.KEY_Escape) {
      dialog.close();
    } else if (modifiers === 0 && key === Gdk.KEY_BackSpace) {
      offer('');
    } else if (Gtk.accelerator_valid(key, modifiers)) {
      offer(capturedAccelerator(controller.get_current_event() as Gdk.KeyEvent | null, keyval, keycode, modifiers));
    }
    // A bare modifier is not a valid accelerator: wait for the next key.
    return true;
  });
  dialog.add_controller(keys);

  // Without the inhibit, GNOME Shell takes its own and the Leike
  // shortcuts before the dialog sees them. The compositor can refuse or
  // ask the user first, so the dialog shows the live state.
  let toplevel: Gdk.Toplevel | null = null;
  let notifyId = 0;
  dialog.connect('map', () => {
    toplevel = (dialog.get_native()?.get_surface() as Gdk.Toplevel | null) ?? null;
    if (toplevel === null) {
      return;
    }
    const surface = toplevel;
    surface.inhibit_system_shortcuts(null);
    inhibitState.label = inhibitStateText(surface.shortcuts_inhibited);
    notifyId = surface.connect('notify::shortcuts-inhibited', () => {
      inhibitState.label = inhibitStateText(surface.shortcuts_inhibited);
    });
  });
  dialog.connect('unmap', () => {
    toplevel?.restore_system_shortcuts();
    if (notifyId !== 0) {
      toplevel?.disconnect(notifyId);
      notifyId = 0;
    }
  });

  dialog.connect('response', (_dialog, response) => {
    if ((response === 'set' || response === 'add') && pending !== null) {
      request.onSave(pending, response);
    }
  });
  dialog.present(parent);
}
