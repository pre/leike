#!/usr/bin/env bash
# Developer tool: builds the extension and copies it into the user
# extensions directory. With XDG_DATA_HOME set to a sandbox directory, the
# extension goes to a headless test shell: see "Test in a headless shell"
# in README.md. Do not use a nested shell (docs/adr/0012).
# End users install the release zip instead, see README.md.
set -euo pipefail

uuid="leike@repo.pet"
gnome_dir="$(cd "$(dirname "$0")" && pwd)"
target="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

(cd "$gnome_dir/.." && npm run build)

rm -rf "$target"
mkdir -p "$target"
cp -r "$gnome_dir/dist/." "$target/"
echo "Installed $uuid to $target"
echo "GNOME Shell loads it at its next start: start the headless test shell, or log out and in."
echo "If it is not enabled then, run: gnome-extensions enable $uuid"
