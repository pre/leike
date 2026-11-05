# Keybindings live in gsettings

Status: accepted.

GNOME Shell grabs global keys only for keybindings that it reads from a gsettings schema, so each action (copy, paste, cut, open history) has one gsettings key, as in Rektangel ADR 0007. The preferences window uses the capture dialog, the conflict badge and the Remove button from Rektangel. The Remove button removes the accelerator from the GNOME key that has it.

GNOME binds Super+V to the notification list. The extension opens the preferences window the first time it is enabled, so that the user sees the Super+V conflict and can press Remove. The setting `first-run-done` records that the window was opened.
