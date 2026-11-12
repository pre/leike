import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { keysFor, type ClipboardAction, type ClipboardContent } from '@leike/core';
import { keyCode, keySequence, type KeyEvent, type Modifier, type PressedKey } from './key-sequence.ts';

const M = Clutter.ModifierType;
const modifierMasks: ReadonlyArray<[Modifier, number]> = [
  ['Shift', M.SHIFT_MASK],
  ['Control', M.CONTROL_MASK],
  ['Alt', M.MOD1_MASK],
  ['Super', M.MOD4_MASK],
];

const pollMs = 5;

// GNOME Terminal ignores Ctrl+Shift+V in the first milliseconds after it gets the focus and a new clipboard content.
const refocusDelayMs = 50;

function modifiersIn(mask: number): Modifier[] {
  return modifierMasks.filter(([, bit]) => (mask & bit) !== 0).map(([modifier]) => modifier);
}

/** The key press that started an action, and the modifiers that were down at that press. */
interface KeyPress extends PressedKey {
  modifiers: Modifier[];
}

/** The data is a copy, because sendAfterRefocus uses it after the handler of the event. */
function currentKeyPress(): KeyPress | null {
  const event = Clutter.get_current_event();
  if (event?.type() !== Clutter.EventType.KEY_PRESS) {
    return null;
  }
  return { modifiers: modifiersIn(event.get_state()), unicode: event.get_key_unicode(), code: event.get_key_code() };
}

/**
 * forward_key does nothing when the input method has no focus, and a window
 * without a text field gives it none. This focus stands in while the keys go
 * out. The input method can call these functions, so they must exist.
 */
class StandInFocus extends Clutter.InputFocus {
  static {
    // The cast is for the type packages only: Clutter and GObject come with different copies of the GObject types.
    GObject.registerClass({ GTypeName: 'LeikeStandInFocus' }, this as never);
  }

  override vfunc_request_surrounding(): void {}
  override vfunc_delete_surrounding(): void {}
  override vfunc_commit_text(): void {}
  override vfunc_set_preedit_text(): void {}
}

/**
 * Sends Ctrl+C/V/X, or Ctrl+Shift+C/V/X to a terminal, to the focused window
 * at the key press of the shortcut, while the modifiers of the shortcut are
 * physically down. A terminal also gets Ctrl+V for an image paste, see keysFor.
 *
 * The keys go out as input method keys (forward_key). Mutter applies such a
 * key to the modifier state of the application only. So a forwarded Super
 * release clears Super for the application, and the Mutter shortcuts still
 * see the physical key. See ADR-0014.
 */
export class Injector {
  /** The modifiers whose left key the application has from a restore. */
  private restored: Modifier[] = [];
  private pollSourceId = 0;
  private refocusSourceId = 0;

  /** The injector calls clipboardContent when the keys go out, so it sees the entry that the popup put on the clipboard. */
  constructor(
    private readonly terminalWmClasses: () => readonly string[],
    private readonly clipboardContent: () => ClipboardContent,
  ) {}

  /** Call it in the handler of the key press of a shortcut. */
  send(action: ClipboardAction): void {
    this.forwardChord(action, currentKeyPress());
  }

  /**
   * For the popup: call it in the key press or click handler, after Main.popModal.
   * The window gets the focus and the new clipboard content at that moment,
   * so the keys go out a moment later.
   */
  sendAfterRefocus(action: ClipboardAction): void {
    const pressed = currentKeyPress();
    this.removeRefocusSource();
    this.refocusSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, refocusDelayMs, () => {
      this.refocusSourceId = 0;
      this.forwardChord(action, pressed);
      return GLib.SOURCE_REMOVE;
    });
  }

  destroy(): void {
    this.removeRefocusSource();
    if (this.pollSourceId !== 0) {
      GLib.source_remove(this.pollSourceId);
      this.pollSourceId = 0;
    }
    this.releaseRestored(this.restored);
  }

  private removeRefocusSource(): void {
    if (this.refocusSourceId !== 0) {
      GLib.source_remove(this.refocusSourceId);
      this.refocusSourceId = 0;
    }
  }

  private forwardChord(action: ClipboardAction, pressed: KeyPress | null): void {
    const down = modifiersIn(global.get_pointer()[2]);
    // The physical release of a modifier can be in the event queue before the keys of this call.
    // So each modifier of the key press gets a release, and only those that are down now get a press.
    const held = pressed?.modifiers ?? down;
    const wmClass = global.display.focus_window?.get_wm_class() ?? null;
    const chord = keysFor(action, wmClass, this.terminalWmClasses(), this.clipboardContent());
    this.forward(keySequence(chord, held, down), pressed);

    this.restored = [...new Set([...this.restored, ...held.filter((modifier) => down.includes(modifier))])];
    this.watchRestored();
  }

  /**
   * The user can hold the right key of a modifier. Its physical release does
   * not release the left key that the application has from the restore. So
   * when a restored modifier goes up, the application gets one more release
   * of the left key.
   */
  private watchRestored(): void {
    if (this.pollSourceId !== 0 || this.restored.length === 0) {
      return;
    }
    this.pollSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pollMs, () => {
      const down = modifiersIn(global.get_pointer()[2]);
      this.releaseRestored(this.restored.filter((modifier) => !down.includes(modifier)));
      if (this.restored.length > 0) {
        return GLib.SOURCE_CONTINUE;
      }
      this.pollSourceId = 0;
      return GLib.SOURCE_REMOVE;
    });
  }

  private releaseRestored(modifiers: readonly Modifier[]): void {
    if (modifiers.length === 0) {
      return;
    }
    this.forward(
      modifiers.map((modifier): KeyEvent => [`${modifier}_L`, false]),
      null,
    );
    this.restored = this.restored.filter((modifier) => !modifiers.includes(modifier));
  }

  private forward(events: readonly KeyEvent[], pressed: PressedKey | null): void {
    const inputMethod = Main.inputMethod as Clutter.InputMethod & { currentFocus: Clutter.InputFocus | null };
    const standIn = inputMethod.currentFocus ? null : new StandInFocus();
    if (standIn) {
      inputMethod.focus_in(standIn);
    }
    let time = GLib.get_monotonic_time();
    for (const [name, isPress] of events) {
      inputMethod.forward_key(Clutter[`KEY_${name}`], keyCode(name, pressed), 0, time++, isPress);
    }
    // The keys are in the event queue now, so the focus is not necessary after this.
    if (standIn) {
      inputMethod.focus_out();
    }
  }
}
