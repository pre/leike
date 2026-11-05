# The history popup is a GNOME Shell widget

Status: accepted. The nested shell in Consequences is superseded by ADR-0012.

The history popup is a St and Clutter widget in the gnome-shell process. It is not a separate GTK window. Only the shell can open a popup at once with a keyboard grab, and then give the focus back to the window that had it before. A GTK window on Wayland cannot set its own position, cannot take the focus from another application, and cannot give the focus back.

## Consequences

- A bug in the popup can stop the shell, so the popup code stays small and the logic stays in the core.
- The development loop for the popup is a nested shell, because the real shell loads new extension code only at login.
