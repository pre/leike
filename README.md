# Leike

Leike keeps a history of your clipboard on GNOME. It has the look and the flow of the clipboard history in [Raycast](https://www.raycast.com/) and [Alfred](https://www.alfredapp.com/). Leike is Finnish for a clip.

Design goal is to be fast and to stay out of the way. Super+C, Super+V and Super+X copy, paste and cut in each application, also in a terminal. The history keeps text and images, and it stays after you log out. One shortcut opens the history: type to filter, move with the arrow keys and press Enter.

Leike is in development. Version 0.1.0 is a skeleton: the extension loads, but it does not do anything yet.

## Default shortcuts

| Action        | Shortcut                                        | Sent to app / terminal        |
|---------------|-------------------------------------------------|-------------------------------|
| Copy          | Super+C                                         | Ctrl+C / Ctrl+Shift+C         |
| Paste         | Super+V                                         | Ctrl+V / Ctrl+Shift+V         |
| Cut           | Super+X                                         | Ctrl+X / Ctrl+Shift+X         |
| Open history  | Super+AltGr+C (`<Super><Mod5>c`), Super+Alt+C   | opens the popup               |

In the popup: Up and Down move, Enter copies, Shift+Enter copies and pastes, Delete removes the entry, Tab cycles the type filter, Escape closes. Typing filters. The mouse selects, and a double-click copies.

Leike sends Ctrl+Shift+C, V and X to a terminal and Ctrl+C, V and X to other windows. The WM_CLASS of the focused window selects the keys. The default terminal list is in the setting `terminal-wm-classes`: org.gnome.Terminal, gnome-terminal-server, org.gnome.Ptyxis, org.gnome.Console, Alacritty, kitty, foot, org.wezfurlong.wezterm, com.mitchellh.ghostty, Terminator and Tilix.

GNOME 46 binds Super+V to the notification list. The preferences window shows the conflict and can remove the GNOME binding.

## Install manually the release zip

Node.js is not needed at runtime as GNOME Shell runs the extension.

1. Build the zip (see Build from source), or download `leike@repo.pet.zip` from a GitHub release.
2. Install Leike as a GNOME extension:

   ```sh
   gnome-extensions install leike@repo.pet.zip
   ```

3. Log out and log in again. On Wayland, GNOME Shell loads new extensions only at login.
4. Enable the extension:

   ```sh
   gnome-extensions enable leike@repo.pet
   ```

## Build from source

You need Node.js 22 or later, npm, `glib-compile-schemas`, `gjs` and `zip`.

```sh
npm install
npm run build   # core with tsc, extension with esbuild, to gnome/dist/
npm test        # unit tests and the GJS smoke test
npm run pack    # writes leike@repo.pet.zip
npm run reload  # packs, installs the zip, disables and enables the extension
```

`npm run reload` makes the shell read the schema again, so a new default works at once. The shell keeps the extension and prefs code until the next login.

### Development in a nested shell

On Wayland, GNOME Shell loads new extension code only at login. A nested shell runs the new code at once, in a window. Give the nested shell its own data and config directories. Then the install and the settings, for example the list of enabled extensions in dconf, do not change your session:

```sh
export XDG_DATA_HOME=$HOME/tmp/leike-nested/data
export XDG_CONFIG_HOME=$HOME/tmp/leike-nested/config
gnome/install.sh
dbus-run-session -- gnome-shell --nested --wayland
```

In a terminal in the nested shell, enable the extension:

```sh
gnome-extensions enable leike@repo.pet
```

Close the nested shell window to stop it. To see the log, start the nested shell from a terminal: the log of the extension comes to that terminal.

### Preview the preferences window

```sh
npm run prefs                 # uses your real settings
npm run prefs-sandbox         # uses temporary settings, nothing real changes
```

`gnome/prefs-dev.sh` builds `gnome/dist` and opens `gnome/dist/prefs.js` with `gnome/test/prefs-launcher.js`. The window uses the schema in `gnome/dist/schemas`, not the installed schema.

## Repository layout

- `core/`: the clipboard history data transforms, with no GNOME imports. A KDE, Windows or macOS front end can use the same core.
- `gnome/`: the GNOME Shell extension, the schema in `gnome/schemas/` and the build scripts.
- `docs/adr/`: the architecture decisions. Read them before you change the architecture.

## License

MIT, see `LICENSE`.
