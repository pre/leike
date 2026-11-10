// Run with test/gjs-store.sh (after node esbuild.mjs). Checks the store
// bundle in GJS, outside gnome-shell, with XDG_DATA_HOME in a temp dir.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { clearHistory } from '../build/clear-history.js';
import { HistoryStore } from '../build/store.js';

const settings = { maxEntries: 3, maxImageBytes: 1000, maxTextBytes: 1000, terminalWmClasses: [], blocklistWmClasses: ['Blocked'] };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function check(name, actual, expected) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`gjs store test failed: ${name}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function waitFor(name, predicate, timeoutMs = 3000) {
  const context = GLib.MainContext.default();
  const end = GLib.get_monotonic_time() + timeoutMs * 1000;
  while (!predicate()) {
    if (GLib.get_monotonic_time() > end) {
      throw new Error(`gjs store test failed: timeout: ${name}`);
    }
    context.iteration(false);
    GLib.usleep(2000);
  }
}

function settle(ms) {
  const end = GLib.get_monotonic_time() + ms * 1000;
  waitFor(`settle ${ms} ms`, () => GLib.get_monotonic_time() > end, ms + 1000);
}

const exists = (path) => GLib.file_test(path, GLib.FileTest.EXISTS);
const readJson = (path) => JSON.parse(decoder.decode(GLib.file_get_contents(path)[1]));
const readJsonOrNull = (path) => {
  try {
    return readJson(path);
  } catch {
    return null;
  }
};
const ids = (store) => store.history.entries.map((entry) => entry.id);
const sha256 = (text) => GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, text, -1);
const pngBytes = (seed) => new GLib.Bytes(encoder.encode(`\x89PNG fake image ${seed}`));
const newStore = () => new HistoryStore({ settings: () => settings, saveDelayMs: 20, checkDelayMs: 20 });

const dir = GLib.build_filenamev([GLib.getenv('XDG_DATA_HOME'), 'leike']);
// Load in an empty data directory.
let store = newStore();
check('the data directory is in XDG_DATA_HOME', [store.dir, store.historyPath, store.imagesDir], [dir, `${dir}/history.json`, `${dir}/images`]);
store.load();
check('empty history', ids(store), []);
check('images directory exists', exists(store.imagesDir), true);
let changes = 0;
store.onChanged(() => changes++);

// Text and image.
const app = { name: 'Text Editor', wmClass: 'org.gnome.TextEditor' };
store.addIncoming({ id: '100-0', text: 'hello', hash: sha256('hello'), now: 100, app });
const image = pngBytes(1);
store.addIncoming({ id: '101-0', image: { width: 2, height: 3, bytes: image.get_size() }, hash: 'image-1', now: 101 }, image);
check('two changes', changes, 2);
// The first write creates the file in place, so wait for complete content.
waitFor('history.json written', () => exists(store.historyPath) && readJsonOrNull(store.historyPath)?.entries.length === 2);
waitFor('image written', () => exists(store.imagePath('101-0')));
check('history.json entries', readJson(store.historyPath).entries.map((entry) => entry.id), ['101-0', '100-0']);
const mode = Gio.File.new_for_path(store.historyPath).query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null).get_attribute_uint32('unix::mode');
check('history.json mode 0600', (mode & 0o777).toString(8), '600');
check('image file content', GLib.file_get_contents(store.imagePath('101-0'))[1].length, image.get_size());

// Dedupe: the same text moves to the top, the same image writes no new file.
store.addIncoming({ id: '102-0', text: 'hello', hash: sha256('hello'), now: 102 });
check('dedupe text keeps the id', ids(store), ['100-0', '101-0']);
store.addIncoming({ id: '103-0', image: { width: 2, height: 3, bytes: image.get_size() }, hash: 'image-1', now: 103 }, image);
check('dedupe image keeps the id', ids(store), ['101-0', '100-0']);
settle(100);
check('no file for the duplicate image', exists(store.imagePath('103-0')), false);

// Rejected changes do not change the history.
const blocked = store.addIncoming({ id: '104-0', text: 'secret', hash: sha256('secret'), now: 104, app: { name: 'B', wmClass: 'blocked' } });
check('blocked app', blocked.rejected, 'blocked-app');
const big = store.addIncoming({ id: '105-0', image: { width: 1, height: 1, bytes: 5000 }, hash: 'big', now: 105 }, pngBytes(2));
check('image too large', big.rejected, 'image-too-large');
check('text too large', store.addIncoming({ id: '105-1', text: 'x'.repeat(1001), hash: 'long', now: 105 }).rejected, 'text-too-large');
settle(100);
check('no file for the rejected image', exists(store.imagePath('105-0')), false);

// The limit evicts the oldest entry and deletes its image file.
store.addIncoming({ id: '106-0', text: 'two', hash: sha256('two'), now: 106 });
store.addIncoming({ id: '107-0', text: 'three', hash: sha256('three'), now: 107 });
check('limit of 3 entries', ids(store), ['107-0', '106-0', '101-0']);
store.addIncoming({ id: '108-0', text: 'four', hash: sha256('four'), now: 108 });
check('evicted the image entry', ids(store), ['108-0', '107-0', '106-0']);
check('deleted the evicted image file', exists(store.imagePath('101-0')), false);

// Pin, touch and remove.
store.togglePinned('106-0');
check('pinned', store.history.entries.find((entry) => entry.id === '106-0').pinned, true);
store.touch('106-0');
check('touch moves to the top', ids(store), ['106-0', '108-0', '107-0']);
store.remove('107-0');
check('remove', ids(store), ['106-0', '108-0']);

// destroy() writes a pending change at once.
store.addIncoming({ id: '109-0', image: { width: 4, height: 4, bytes: 10 }, hash: 'image-2', now: 109 }, pngBytes(3));
store.destroy();
check('destroy flushed', readJson(store.historyPath).entries.map((entry) => entry.id), ['109-0', '106-0', '108-0']);
waitFor('image of the flushed entry written', () => exists(GLib.build_filenamev([dir, 'images', '109-0.png'])));

// Reload: orphan image files go away, and an image entry with no file goes away.
GLib.file_set_contents(GLib.build_filenamev([dir, 'images', '999-0.png']), 'orphan');
const history = readJson(GLib.build_filenamev([dir, 'history.json']));
history.entries.push({ id: '998-0', type: 'image', createdAt: 1, image: { width: 1, height: 1, bytes: 1 }, pinned: false, hash: 'gone' });
GLib.file_set_contents(GLib.build_filenamev([dir, 'history.json']), JSON.stringify(history));
store = newStore();
store.load();
check('reloaded entries without the missing image', ids(store), ['109-0', '106-0', '108-0']);
check('reloaded pinned state', store.history.entries[1].pinned, true);
check('deleted the orphan image', exists(store.imagePath('999-0')), false);
check('kept the referenced image', exists(store.imagePath('109-0')), true);
settle(100);
check('saved the reconciled history', readJson(store.historyPath).entries.length, 3);

// The store ignores its own writes.
changes = 0;
store.onChanged(() => changes++);
store.addIncoming({ id: '110-0', text: 'own', hash: sha256('own'), now: 110 });
settle(300);
check('own write is not a reload', changes, 1);

// Another process changes history.json.
const external = { version: 1, entries: [{ id: '200-0', type: 'text', createdAt: 200, text: 'from prefs', pinned: false, hash: 'x' }] };
GLib.file_set_contents(store.historyPath, JSON.stringify(external));
waitFor('reload after an external change', () => ids(store).join() === '200-0');
check('reload deleted the unreferenced image', exists(store.imagePath('109-0')), false);

// Another process deletes history.json and images/ ("Clear history" in prefs).
store.addIncoming({ id: '201-0', image: { width: 1, height: 1, bytes: 10 }, hash: 'image-3', now: 201 }, pngBytes(4));
waitFor('image 201 written', () => exists(store.imagePath('201-0')));
settle(100);
Gio.File.new_for_path(store.imagePath('201-0')).delete(null);
Gio.File.new_for_path(store.imagesDir).delete(null);
Gio.File.new_for_path(store.historyPath).delete(null);
waitFor('clear after an external delete', () => store.history.entries.length === 0);
store.addIncoming({ id: '202-0', image: { width: 1, height: 1, bytes: 10 }, hash: 'image-4', now: 202 }, pngBytes(5));
waitFor('image written after images/ was deleted', () => exists(store.imagePath('202-0')));

// "Clear history" in the preferences window, the code that the prefs process runs.
store.addIncoming({ id: '203-0', text: 'before clear', hash: sha256('before clear'), now: 203 });
settle(100);
clearHistory(GLib.getenv('XDG_DATA_HOME'));
waitFor('clear from the preferences window', () => store.history.entries.length === 0);
check('no image file after the clear', exists(store.imagePath('202-0')), false);
store.addIncoming({ id: '204-0', image: { width: 1, height: 1, bytes: 10 }, hash: 'image-5', now: 204 }, pngBytes(6));
waitFor('image written after the clear', () => exists(store.imagePath('204-0')));
store.destroy();

// No write lands after destroy(): a history write and an image write are in flight.
const listNames = (path) => {
  const names = [];
  const children = Gio.File.new_for_path(path).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
  for (let info = children.next_file(null); info !== null; info = children.next_file(null)) {
    names.push(info.get_name());
  }
  children.close(null);
  return names.sort();
};
store = newStore();
store.load();
store.addIncoming({ id: '300-0', text: 'in flight', hash: sha256('in flight'), now: 300 });
waitFor('history write in flight', () => store.writing);
store.addIncoming({ id: '301-0', image: { width: 1, height: 1, bytes: 10 }, hash: 'image-6', now: 301 }, pngBytes(7));
store.destroy();
check('destroy wrote the newest history', readJson(store.historyPath).entries.map((entry) => entry.id), ['301-0', '300-0', '204-0']);
check('destroy wrote the image in flight', exists(store.imagePath('301-0')), true);
const marker = JSON.stringify({ version: 1, entries: [] });
GLib.file_set_contents(store.historyPath, marker);
settle(300);
check('no write after destroy', decoder.decode(GLib.file_get_contents(store.historyPath)[1]), marker);
check('no temporary files after destroy', [...listNames(dir), ...listNames(store.imagesDir)].filter((name) => name.endsWith('.tmp')), []);

// load() deletes the temporary files of writes that did not complete.
GLib.file_set_contents(`${store.historyPath}.left.tmp`, 'x');
GLib.file_set_contents(`${store.imagePath('301-0')}.left.tmp`, 'x');
store = newStore();
store.load();
check('load deleted the temporary files', [...listNames(dir), ...listNames(store.imagesDir)].filter((name) => name.endsWith('.tmp')), []);
store.destroy();

// A corrupt history.json is kept as history.json.broken-<time>.
GLib.file_set_contents(store.historyPath, '{not json');
store = newStore();
store.load();
check('corrupt file gives an empty history', ids(store), []);
const names = [];
const enumerator = Gio.File.new_for_path(dir).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
  names.push(info.get_name());
}
check('broken copy exists', names.some((name) => name.startsWith('history.json.broken-')), true);
check('the image of the lost history is an orphan', exists(store.imagePath('204-0')), false);
check('unsafe id', (() => {
  try {
    store.imagePath('../x');
    return 'no error';
  } catch {
    return 'error';
  }
})(), 'error');
store.destroy();

// "Clear history" while a save waits. The check of the delete comes after
// the save here, so only the delete itself can stop the old history.
const text = (id, value) => ({ id, text: value, hash: sha256(value), now: Number(id.split('-')[0]) });
const diskIds = () => readJsonOrNull(store.historyPath)?.entries.map((entry) => entry.id) ?? [];
const userDataDir = GLib.getenv('XDG_DATA_HOME');
store = new HistoryStore({ settings: () => settings, saveDelayMs: 150, checkDelayMs: 1000 });
store.load();
store.addIncoming(text('400-0', 'on the disk'));
waitFor('the first entry is on the disk', () => diskIds().join() === '400-0');
store.addIncoming(text('401-0', 'in a save that waits'));
clearHistory(userDataDir);
waitFor('a clear while a save waits empties the history', () => ids(store).length === 0, 500);
settle(300);
check('the save after a clear writes no old entry', diskIds(), []);

// The same with a write in flight: its file has the old history.
store.addIncoming(text('402-0', 'on the disk again'));
waitFor('the entry is on the disk', () => diskIds().join() === '402-0');
store.addIncoming(text('403-0', 'in a write in flight'));
waitFor('history write in flight', () => store.writing);
clearHistory(userDataDir);
waitFor('a clear while a write is in flight empties the history', () => ids(store).length === 0, 500);
settle(400);
check('the disk has no old entry after the write in flight', diskIds(), []);

// destroy() writes the pending changes. After a clear these must not be the old history.
store.addIncoming(text('404-0', 'on the disk a third time'));
waitFor('the entry is on the disk', () => diskIds().join() === '404-0');
store.addIncoming(text('405-0', 'in a second save that waits'));
clearHistory(userDataDir);
waitFor('the store sees the clear before destroy', () => ids(store).length === 0, 500);
store.destroy();
check('destroy after a clear writes no old entry', diskIds(), []);

print('gjs smoke test passed: store bundle');
