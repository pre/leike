# Copy, paste and cut send keys with a virtual keyboard

Status: accepted. The virtual keyboard device and the Super release in Consequences are superseded by ADR-0014.

Wayland has no command that tells another application to copy, paste or cut. Super+C, Super+V and Super+X send Ctrl+C, Ctrl+V and Ctrl+X to the focused window with a Clutter virtual keyboard device. A terminal uses Ctrl+C to stop a process, so a terminal gets Ctrl+Shift+C, Ctrl+Shift+V and Ctrl+Shift+X. The WM_CLASS of the focused window selects the keys. The list of terminal WM_CLASS values is the setting `terminal-wm-classes`.

## Consequences

- Super is still down when the shortcut fires. The injector sends a Super release before the Ctrl keys. It does not press Super again, because a Super press and release opens Activities.
- A terminal that is not in the list gets Ctrl+C. The user adds its WM_CLASS in the preferences window.
