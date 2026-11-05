# Sandbox tests run in a headless shell

Status: accepted. Supersedes the nested shell in the Consequences of ADR-0003.

On GNOME 46, `gnome-shell --nested` uses the X11 nested backend. Its Clutter virtual keyboard is an XTest device on the Xwayland of the real session, and its keymap is the keymap of the real session. Leike injects keys, so a test in a nested shell can send keys to the real session. The runtime tests use a headless shell with the native backend: `gnome-shell --headless --wayland --no-x11 --virtual-monitor 1280x800` under `dbus-run-session`, with all XDG directories, `XDG_RUNTIME_DIR` and a keyfile GSettings backend in a temporary directory. The headless shell has its own seat and keymap, and no access to real input devices.

## Consequences

- The headless shell has no window. A test drives it over D-Bus with a test-only extension and reads the log. A screenshot comes from `Shell.Screenshot`.
- A physical keyboard is a second virtual keyboard in the headless shell. Mutter counts the keys of the seat, so the two devices act as a real keyboard and the injector.
- The Leike extension has no test code. The test-only extension gets the Leike object from `Main.extensionManager`.
- Firefox, VS Code, Ptyxis and the physical keyboard need a test in the real session.
