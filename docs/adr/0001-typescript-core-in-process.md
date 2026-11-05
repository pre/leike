# TypeScript core that runs in-process, in one repository with core/ and gnome/

Status: accepted.

On Wayland, only the compositor process can grab global keys, read the clipboard of other applications at each change and send keys to the focused window. The only supported way to run code in gnome-shell is a Shell extension in JavaScript. We write the core in TypeScript, so that the same bundle runs in-process in GJS, and later in QJSEngine for KDE, with no glue code and no extra process. The reasons are the same as in Rektangel ADR 0001 and ADR 0002.

All platforms live in one repository: `core/` holds the shared data transforms, and each desktop has its own top-level directory (`gnome/` now). One change to the core then reaches each platform in one commit.

The build chain comes from Rektangel: npm workspaces, `tsconfig.base.json`, an esbuild bundle with `gi://*` and `resource:///*` as external modules, `node --test` for the unit tests, a GJS smoke test for the core bundle, `pack.sh` and `reload.sh`.

## Considered Options

- A daemon in another language over D-Bus: two processes, and the daemon cannot grab keys or send keys on Wayland.
- A GTK application with a portal: the clipboard portal does not tell an application about each clipboard change.
