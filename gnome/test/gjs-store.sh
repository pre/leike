#!/usr/bin/env bash
# Runs the GJS store test with XDG_DATA_HOME in a new temp directory.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp_root="${TMPDIR:-$HOME/tmp}"
mkdir -p "$tmp_root"
data_home="$(mktemp -d "$tmp_root/leike-store-test.XXXXXX")"
trap 'rm -rf "$data_home"' EXIT
XDG_DATA_HOME="$data_home" timeout 60 gjs -m test/gjs-store.js
