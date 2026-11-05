# The core is pure data transforms with no I/O

Status: accepted.

The core does no I/O. It does not read the clipboard, the files, the keys or the settings. The GNOME layer owns the clipboard, the files, the keys and the UI. The GNOME layer gives the core plain objects (an `Incoming` clipboard change, the `History`, the `Settings`) and the core gives back plain objects (a new `History` and the image ids to delete). This is the same contract as `execute()` in Rektangel.

## Consequences

- The core tests run in Node.js with no GNOME and no mocks.
- A KDE, Windows or macOS front end can use the core with its own I/O.
- The platform calculates the hash of the content (sha256) and the id of a new entry, because the core has no crypto and no clock.
