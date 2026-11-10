// Run with: gjs -m test/gjs-clear-history.js (after node esbuild.mjs).
// Checks clearHistory on real files in a temporary directory under
// $HOME/tmp: only history.json, the copies of a broken history.json and
// the PNG files in images/ go away.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { clearHistory, deleteIgnoringMissing } from '../build/clear-history.js';

const tmpRoot = GLib.build_filenamev([GLib.get_home_dir(), 'tmp']);
GLib.mkdir_with_parents(tmpRoot, 0o755);
const root = GLib.build_filenamev([tmpRoot, `leike-clear-${GLib.uuid_string_random()}`]);
GLib.mkdir_with_parents(root, 0o755);
const path = (...parts) => GLib.build_filenamev([root, ...parts]);
const write = (file) => GLib.file_set_contents(file, 'x');
const exists = (file) => GLib.file_test(file, GLib.FileTest.EXISTS);
const failures = [];
const expect = (condition, text) => {
  if (!condition) {
    failures.push(text);
  }
};

function removeTree(file) {
  const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
  if (info.get_file_type() === Gio.FileType.DIRECTORY) {
    const children = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    for (let child = children.next_file(null); child !== null; child = children.next_file(null)) {
      removeTree(file.get_child(child.get_name()));
    }
  }
  file.delete(null);
}

try {
  // A normal history with a subdirectory and a file that is not a PNG file.
  GLib.mkdir_with_parents(path('normal', 'leike', 'images', 'sub.png'), 0o755);
  write(path('normal', 'leike', 'history.json'));
  write(path('normal', 'leike', 'images', 'a.png'));
  write(path('normal', 'leike', 'images', 'notes.txt'));
  // The store keeps a history.json that is not valid under this name. It has old clipboard text.
  write(path('normal', 'leike', 'history.json.broken-20261110T081956'));
  write(path('normal', 'leike', 'notes.txt'));
  clearHistory(path('normal'));
  expect(!exists(path('normal', 'leike', 'history.json')), 'history.json is deleted');
  expect(!exists(path('normal', 'leike', 'history.json.broken-20261110T081956')), 'the copy of a broken history.json is deleted');
  expect(exists(path('normal', 'leike', 'notes.txt')), 'another file in the data directory is kept');
  expect(!exists(path('normal', 'leike', 'images', 'a.png')), 'a.png is deleted');
  expect(exists(path('normal', 'leike', 'images', 'notes.txt')), 'notes.txt is kept');
  expect(exists(path('normal', 'leike', 'images', 'sub.png')), 'the subdirectory is kept');

  // images/ is a symbolic link to a directory outside the data directory.
  GLib.mkdir_with_parents(path('outside'), 0o755);
  write(path('outside', 'precious.png'));
  GLib.mkdir_with_parents(path('linked', 'leike'), 0o755);
  Gio.File.new_for_path(path('linked', 'leike', 'images')).make_symbolic_link(path('outside'), null);
  clearHistory(path('linked'));
  expect(exists(path('outside', 'precious.png')), 'a file behind a linked images directory is kept');

  // No data directory at all.
  clearHistory(path('missing'));

  // The extension can delete a file a moment before the preferences window does.
  write(path('gone.png'));
  deleteIgnoringMissing(Gio.File.new_for_path(path('gone.png')));
  expect(!exists(path('gone.png')), 'deleteIgnoringMissing deletes a file');
  deleteIgnoringMissing(Gio.File.new_for_path(path('gone.png')));
  let otherError = false;
  GLib.mkdir_with_parents(path('full', 'child'), 0o755);
  try {
    deleteIgnoringMissing(Gio.File.new_for_path(path('full')));
  } catch {
    otherError = true;
  }
  expect(otherError, 'deleteIgnoringMissing throws other errors');
} finally {
  removeTree(Gio.File.new_for_path(root));
}

if (failures.length > 0) {
  printerr(`gjs clear-history test failed:\n  ${failures.join('\n  ')}`);
  imports.system.exit(1);
}
print('gjs clear-history test passed');
