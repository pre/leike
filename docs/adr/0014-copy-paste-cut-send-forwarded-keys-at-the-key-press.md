# Copy, paste and cut send forwarded keys at the key press

Status: accepted. Supersedes ADR-0011 and the virtual keyboard device of ADR-0004. The decision of ADR-0004 to send Ctrl+C, Ctrl+V and Ctrl+X, and Ctrl+Shift with the letter to a terminal, stays.

With ADR-0011 the keys go out when the user releases Super. The paste shows late, Super held with V pressed three times pastes one time, and Super held with C and then V does not copy.

Mutter 46 keeps two modifier states: the state of the seat, which its own shortcuts use, and the state that the application gets. A key from `Main.inputMethod.forward_key()` changes only the state of the application. GNOME Shell uses this call for the keys that IBus gives back. So the injector forwards these keys at the key press of the shortcut, while the modifiers are physically down:

1. A release of the left and the right key of each modifier that was down at the key press.
2. Ctrl, Shift for a terminal, the letter press, and the release of Shift and Ctrl.
3. A press of the left key of each of these modifiers that is still down.
4. The release of the letter.

The mechanism is the same for all windows. The terminal list of ADR-0004 selects only the keys of step 2.

- The seat state decides step 3. The physical release of a modifier can be in the event queue before the forwarded keys, and a press after it leaves the modifier down for the application.
- The user can hold the right key of a modifier. Its physical release does not release the left key of step 3. So the injector polls the seat state every 5 ms, and when the modifier is up it forwards one more release of the left key. `destroy()` forwards this release at once.
- The letter release is last. A Super press that is the last key before the Super release opens the overview.
- `forward_key` does nothing when the input method has no focus. A window without a text field gives none, so a stand-in `Clutter.InputFocus` takes the focus while the keys go into the event queue.
- `forward_key` takes a key code, and Mutter has no call for JavaScript that gives the key code of a key name. The letter uses the key code of the pressed key when that key gives the letter, as V in Super+V does on each layout. All other keys use the key codes of a PC keyboard, with the letters at their QWERTY positions.
- The popup sends the paste of Enter or a click 50 ms after it closes. The window gets the focus and the new clipboard content at the same moment, and GNOME Terminal ignores Ctrl+Shift+V in the first milliseconds after that (headless shell: 0 of 4 pastes with no delay, 3 of 4 after 2 ms, 4 of 4 after 5 ms and more).

## Consequences

- The pasted text is in the application about 1 to 5 ms after the key press (headless shell: GTK3, GTK4 and GNOME Terminal), and about 5 to 15 ms in a GTK client on Xwayland. Google Chrome pastes too. Each press of the letter with Super held sends the keys again. This is a real paste, so images and long texts work.
- The application gets key releases with no press: the modifier key that was not down, a second release of the letter, and a second release of the left modifier key. GTK3, GTK4, VTE, Chrome and the X server did not react to them.
- A copy, paste or cut shortcut can use Shift, Ctrl, Alt and Super. Another modifier, for example AltGr, stays down for the application, and the keys do not work.
- An XKB option that moves the left Ctrl or the left Shift key, for example `ctrl:swapcaps`, gives the application a different key for the key code of the table.
- On a layout where C, V and X are not at the QWERTY positions, the paste from the popup and a shortcut with a key that is not the letter of its action send a different letter.
- The two modifier states are Mutter behaviour and not a documented interface. The code was read in Mutter 46.2. A new GNOME version needs a new test.
- An X11 session does not give its applications keys from Mutter, so this works only in a Wayland session. This was not tested.

## Considered Options

- Wait for the released modifiers, ADR-0011: the paste is late.
- Commit the clipboard text through the input method: it handles only text, and a terminal runs each line of committed text.
- No press in step 3: no poll and no risk of a modifier that stays down. But a key that the user presses with Super still down goes to the application as a plain key.
- A key code lookup with a temporary `global.display.grab_accelerator()` and a scan with `get_keybinding_action()`: it gives the codes of the letters in 30 to 70 µs, but not the codes of Control_L and Super_L, because Mutter answers with the locate-pointer key and the overlay key for those codes.
- A release from the virtual keyboard device, or a new keymap: Mutter discards the release, and a new keymap drops the injected letter (tested for ADR-0011 and in the research of 2026-11-10).
