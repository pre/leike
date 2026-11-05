#!/usr/bin/env bash
# Developer tool: builds the extension and opens the preferences window
# from gnome/dist, without an install or a logout.
#   prefs-dev.sh            uses the real dconf: changes apply to your session
#   prefs-dev.sh --sandbox  uses a keyfile backend and a temporary
#                           XDG_CONFIG_HOME and XDG_DATA_HOME under $HOME/tmp:
#                           nothing real changes, and Clear history does not
#                           touch the real history
set -euo pipefail

gnome_dir="$(cd "$(dirname "$0")" && pwd)"
dist_dir="$gnome_dir/dist"

case "${1:-}" in
  "") sandbox=false ;;
  --sandbox) sandbox=true ;;
  *) echo "Usage: $0 [--sandbox]" >&2; exit 2 ;;
esac

# The ExtensionPreferences class needs the typelibs of gnome-shell.
typelib_dir=""
for dir in /usr/lib*/gnome-shell/girepository-1.0; do
  if [[ -d "$dir" ]]; then
    typelib_dir="$dir"
    break
  fi
done
if [[ -z "$typelib_dir" ]]; then
  echo "Cannot find gnome-shell/girepository-1.0 under /usr/lib*. Install gnome-shell." >&2
  exit 1
fi

# The bundles include core/dist. esbuild.mjs also compiles the schema
# into dist/schemas.
(cd "$gnome_dir/.." && npm run build --workspace core)
(cd "$gnome_dir" && node esbuild.mjs)

export GI_TYPELIB_PATH="$typelib_dir${GI_TYPELIB_PATH:+:$GI_TYPELIB_PATH}"
export LD_LIBRARY_PATH="${typelib_dir%/girepository-1.0}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

if [[ "$sandbox" == true ]]; then
  mkdir -p "$HOME/tmp"
  sandbox_dir="$(mktemp -d "$HOME/tmp/leike-prefs-sandbox.XXXXXX")"
  trap 'rm -rf "$sandbox_dir"' EXIT
  mkdir -p "$sandbox_dir/config" "$sandbox_dir/data"
  echo "Sandbox: settings go to $sandbox_dir/config, the history to $sandbox_dir/data"
  GSETTINGS_BACKEND=keyfile XDG_CONFIG_HOME="$sandbox_dir/config" XDG_DATA_HOME="$sandbox_dir/data" \
    gjs -m "$gnome_dir/test/prefs-launcher.js" "$dist_dir"
else
  gjs -m "$gnome_dir/test/prefs-launcher.js" "$dist_dir"
fi
