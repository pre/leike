import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { keysFor, type ClipboardAction } from '@leike/core';
import { keySequence } from './key-sequence.ts';

const M = Clutter.ModifierType;
const heldModifiers =
  M.SHIFT_MASK | M.CONTROL_MASK | M.MOD1_MASK | M.MOD3_MASK | M.MOD4_MASK | M.MOD5_MASK | M.SUPER_MASK | M.HYPER_MASK | M.META_MASK;

const pollMs = 5;
const giveUpMs = 2000;

/**
 * Sends Ctrl+C/V/X, or Ctrl+Shift+C/V/X to a terminal, through a Clutter
 * virtual keyboard.
 *
 * Mutter ignores a virtual release of a key that the physical keyboard
 * holds, so the injector cannot release Super for the app. It waits until
 * the user has released all modifiers, then sends the chord.
 *
 * Known gap: when the user releases Super before the letter, the letter is
 * still down when the chord goes out, and Mutter drops the injected press
 * of a key that is down. Nothing is copied then. Mutter has no API that
 * tells if one key is down, so the injector cannot wait for the letter.
 * Ctrl+Insert, Shift+Insert and Shift+Delete would avoid the letter, but
 * Shift+Insert pastes PRIMARY in VTE terminals, and Firefox and VS Code are
 * not tested yet. The injector keeps the letter chords until a test in the
 * real session shows that the gap is a problem.
 */
export class Injector {
  private device: Clutter.VirtualInputDevice | null;
  private pollSourceId = 0;
  private pending: { resolve: (sent: boolean) => void; reject: (error: unknown) => void } | null = null;

  constructor(private readonly terminalWmClasses: () => readonly string[]) {
    const seat = Clutter.get_default_backend().get_default_seat();
    this.device = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
  }

  /**
   * Sends the chord of the action to the focused window when no modifier is
   * held. A new call replaces a call that still waits. Gives false when the
   * chord was not sent: the modifiers stayed down for 2 s, a new call came,
   * or the injector was destroyed. Rejects when the chord cannot be sent.
   */
  run(action: ClipboardAction): Promise<boolean> {
    this.cancel();
    return new Promise((resolve, reject) => {
      if (this.trySend(action)) {
        resolve(true);
        return;
      }
      const start = GLib.get_monotonic_time();
      this.pending = { resolve, reject };
      this.pollSourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pollMs, () => {
        try {
          if (this.trySend(action)) {
            this.finish(true);
            return GLib.SOURCE_REMOVE;
          }
        } catch (error) {
          this.fail(error);
          return GLib.SOURCE_REMOVE;
        }
        if (GLib.get_monotonic_time() - start > giveUpMs * 1000) {
          console.warn(`Leike: did not send ${action}, a modifier key was still down after ${giveUpMs} ms`);
          this.finish(false);
          return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
      });
    });
  }

  /** For the history popup: call it after Main.popModal. It waits for Shift of Shift+Enter to go up. */
  pasteIntoFocusedWindow(): Promise<boolean> {
    return this.run('paste');
  }

  destroy(): void {
    this.cancel();
    this.device = null;
  }

  private cancel(): void {
    if (this.pollSourceId !== 0) {
      GLib.source_remove(this.pollSourceId);
    }
    this.finish(false);
  }

  private finish(sent: boolean): void {
    this.pollSourceId = 0;
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(sent);
  }

  private fail(error: unknown): void {
    this.pollSourceId = 0;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
  }

  private trySend(action: ClipboardAction): boolean {
    const [, , mods] = global.get_pointer();
    if ((mods & heldModifiers) !== 0 || this.device === null) {
      return false;
    }
    // Read the window when the keys go out: the focus can change while the injector waits.
    const wmClass = global.display.focus_window?.get_wm_class() ?? null;
    const chord = keysFor(action, wmClass, this.terminalWmClasses());
    // Look up all keys before the first press, so an unknown key cannot leave Ctrl down.
    const events = keySequence(chord).map(([name, pressed]) => {
      const keyval = (Clutter as unknown as Record<string, number | undefined>)[`KEY_${name}`];
      if (keyval === undefined) {
        throw new Error(`unknown key ${name}`);
      }
      return { keyval, state: pressed ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED };
    });
    let time = GLib.get_monotonic_time();
    for (const { keyval, state } of events) {
      this.device.notify_keyval(time++, keyval, state);
    }
    return true;
  }
}
