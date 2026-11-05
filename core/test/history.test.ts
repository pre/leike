import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addEntry,
  emptyHistory,
  pruneHistory,
  removeEntry,
  togglePinned,
  touchEntry,
  type Entry,
  type History,
  type Incoming,
  type Settings,
} from '../src/index.js';

const settings: Settings = {
  maxEntries: 3,
  maxImageBytes: 1000,
  maxTextBytes: 100,
  terminalWmClasses: [],
  blocklistWmClasses: ['KeePassXC'],
};

function textEntry(id: string, createdAt: number, pinned = false): Entry {
  return { id, type: 'text', createdAt, text: `text ${id}`, pinned, hash: `hash-${id}` };
}

function imageEntry(id: string, createdAt: number, pinned = false): Entry {
  return {
    id,
    type: 'image',
    createdAt,
    image: { width: 10, height: 20, bytes: 500 },
    pinned,
    hash: `hash-${id}`,
  };
}

function historyOf(...entries: Entry[]): History {
  return { entries };
}

function ids(history: History): string[] {
  return history.entries.map((entry) => entry.id);
}

test('addEntry puts a new text entry on top with the type from classify', () => {
  // Arrange
  const history = historyOf(textEntry('a', 100));
  const incoming: Incoming = {
    id: 'b',
    text: 'https://example.com',
    hash: 'hash-b',
    app: { name: 'Firefox', wmClass: 'firefox' },
    now: 200,
  };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(change.history.entries[0], {
    id: 'b',
    type: 'link',
    createdAt: 200,
    text: 'https://example.com',
    app: { name: 'Firefox', wmClass: 'firefox' },
    pinned: false,
    hash: 'hash-b',
  });
  assert.deepEqual(ids(change.history), ['b', 'a']);
  assert.deepEqual(change.deletedImageIds, []);
  assert.equal(change.rejected, undefined);
});

test('addEntry stores an image as an image entry', () => {
  // Arrange
  const incoming: Incoming = { id: 'img', image: { width: 4, height: 3, bytes: 999 }, hash: 'h', now: 5 };

  // Act
  const change = addEntry(emptyHistory, incoming, settings);

  // Assert
  assert.deepEqual(change.history.entries, [
    { id: 'img', type: 'image', createdAt: 5, image: { width: 4, height: 3, bytes: 999 }, pinned: false, hash: 'h' },
  ]);
});

test('addEntry moves a duplicate to the top and keeps its id and pinned state', () => {
  // Arrange
  const history = historyOf(textEntry('c', 300), textEntry('b', 200), textEntry('a', 100, true));
  const incoming: Incoming = { id: 'new', text: 'text a', hash: 'hash-a', now: 400 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(ids(change.history), ['a', 'c', 'b']);
  const top = change.history.entries[0];
  assert.equal(top?.createdAt, 400);
  assert.equal(top?.pinned, true);
  assert.deepEqual(change.deletedImageIds, []);
});

test('addEntry gives the app of the last copy to a duplicate', () => {
  // Arrange
  const history = historyOf({ ...textEntry('a', 100), app: { name: 'Old', wmClass: 'old' } });
  const incoming: Incoming = { id: 'new', text: 'text a', hash: 'hash-a', app: { name: 'New', wmClass: 'new' }, now: 200 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(change.history.entries[0]?.app, { name: 'New', wmClass: 'new' });
});

test('addEntry reports the new image file for deletion when the image is a duplicate', () => {
  // Arrange
  const history = historyOf(textEntry('b', 200), imageEntry('a', 100));
  const incoming: Incoming = { id: 'new', image: { width: 10, height: 20, bytes: 500 }, hash: 'hash-a', now: 300 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(ids(change.history), ['a', 'b']);
  assert.deepEqual(change.deletedImageIds, ['new']);
});

test('addEntry evicts the oldest unpinned entry when the history is full', () => {
  // Arrange
  const history = historyOf(textEntry('c', 300), textEntry('b', 200), imageEntry('a', 100));
  const incoming: Incoming = { id: 'd', text: 'new', hash: 'hash-d', now: 400 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(ids(change.history), ['d', 'c', 'b']);
  assert.deepEqual(change.deletedImageIds, ['a']);
});

test('addEntry keeps pinned entries and evicts the oldest unpinned one', () => {
  // Arrange
  const history = historyOf(textEntry('c', 300), textEntry('b', 200), textEntry('a', 100, true));
  const incoming: Incoming = { id: 'd', text: 'new', hash: 'hash-d', now: 400 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(ids(change.history), ['d', 'c', 'a']);
});

test('addEntry keeps pinned entries beyond the limit and then evicts even the new entry', () => {
  // Arrange
  const history = historyOf(
    textEntry('d', 400, true),
    textEntry('c', 300, true),
    textEntry('b', 200),
    textEntry('a', 100, true),
  );
  const incoming: Incoming = { id: 'e', text: 'new', hash: 'hash-e', now: 500 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(ids(change.history), ['d', 'c', 'a']);
});

test('addEntry rejects an image that is larger than the limit and reports its file for deletion', () => {
  // Arrange
  const history = historyOf(textEntry('a', 100));
  const incoming: Incoming = { id: 'big', image: { width: 1, height: 1, bytes: 1001 }, hash: 'h', now: 200 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.equal(change.history, history);
  assert.equal(change.rejected, 'image-too-large');
  assert.deepEqual(change.deletedImageIds, ['big']);
});

test('addEntry rejects text whose UTF-8 size is larger than the limit', () => {
  // Arrange: 51 characters, 101 UTF-8 bytes
  const history = historyOf(textEntry('a', 100));
  const incoming: Incoming = { id: 'long', text: `${'ä'.repeat(50)}!`, hash: 'h', now: 200 };

  // Act
  const change = addEntry(history, incoming, settings);

  // Assert
  assert.equal(change.history, history);
  assert.equal(change.rejected, 'text-too-large');
  assert.deepEqual(change.deletedImageIds, []);
});

test('addEntry counts 4 UTF-8 bytes for a character outside the BMP', () => {
  // Arrange: 25 emoji of 4 bytes and 1 ASCII byte
  const incoming: Incoming = { id: 'e', text: `${'😀'.repeat(25)}!`, hash: 'h', now: 1 };

  // Act
  const change = addEntry(emptyHistory, incoming, settings);

  // Assert
  assert.equal(change.rejected, 'text-too-large');
});

test('addEntry accepts text that is exactly at the byte limit', () => {
  // Arrange: 100 UTF-8 bytes
  const incoming: Incoming = { id: 't', text: 'ä'.repeat(50), hash: 'h', now: 1 };

  // Act
  const change = addEntry(emptyHistory, incoming, settings);

  // Assert
  assert.equal(change.rejected, undefined);
  assert.deepEqual(ids(change.history), ['t']);
});

test('addEntry accepts an image that is exactly at the limit', () => {
  // Arrange
  const incoming: Incoming = { id: 'img', image: { width: 1, height: 1, bytes: 1000 }, hash: 'h', now: 1 };

  // Act
  const change = addEntry(emptyHistory, incoming, settings);

  // Assert
  assert.equal(change.rejected, undefined);
  assert.deepEqual(ids(change.history), ['img']);
});

for (const text of ['', '   ', '\n\t ']) {
  test(`addEntry rejects the empty text ${JSON.stringify(text)}`, () => {
    // Arrange
    const history = historyOf(textEntry('a', 100));
    const incoming: Incoming = { id: 'b', text, hash: 'h', now: 200 };

    // Act
    const change = addEntry(history, incoming, settings);

    // Assert
    assert.equal(change.history, history);
    assert.equal(change.rejected, 'empty');
    assert.deepEqual(change.deletedImageIds, []);
  });
}

test('addEntry rejects an incoming with no text and no image', () => {
  // Arrange
  const incoming: Incoming = { id: 'b', hash: 'h', now: 200 };

  // Act
  const change = addEntry(emptyHistory, incoming, settings);

  // Assert
  assert.equal(change.rejected, 'empty');
  assert.deepEqual(change.history.entries, []);
});

test('addEntry rejects a copy from an app on the blocklist, compared case-insensitively', () => {
  // Arrange
  const incoming: Incoming = {
    id: 'img',
    image: { width: 1, height: 1, bytes: 10 },
    hash: 'h',
    app: { name: 'KeePassXC', wmClass: 'keepassxc' },
    now: 1,
  };

  // Act
  const change = addEntry(emptyHistory, incoming, settings);

  // Assert
  assert.equal(change.rejected, 'blocked-app');
  assert.deepEqual(change.history.entries, []);
  assert.deepEqual(change.deletedImageIds, ['img']);
});

test('addEntry does not change the history that it gets', () => {
  // Arrange
  const entries = [textEntry('c', 300), textEntry('b', 200), textEntry('a', 100)];
  const history = historyOf(...entries);
  const incoming: Incoming = { id: 'd', text: 'text b', hash: 'hash-b', now: 400 };

  // Act
  addEntry(history, incoming, settings);

  // Assert
  assert.deepEqual(ids(history), ['c', 'b', 'a']);
  assert.equal(entries[1]?.createdAt, 200);
});

test('removeEntry removes a text entry and deletes no image', () => {
  // Arrange
  const history = historyOf(textEntry('b', 200), textEntry('a', 100));

  // Act
  const change = removeEntry(history, 'b');

  // Assert
  assert.deepEqual(ids(change.history), ['a']);
  assert.deepEqual(change.deletedImageIds, []);
});

test('removeEntry reports the image file of an image entry for deletion', () => {
  // Arrange
  const history = historyOf(textEntry('b', 200), imageEntry('a', 100));

  // Act
  const change = removeEntry(history, 'a');

  // Assert
  assert.deepEqual(ids(change.history), ['b']);
  assert.deepEqual(change.deletedImageIds, ['a']);
});

test('removeEntry gives the same history for an unknown id', () => {
  // Arrange
  const history = historyOf(textEntry('a', 100));

  // Act
  const change = removeEntry(history, 'missing');

  // Assert
  assert.equal(change.history, history);
  assert.deepEqual(change.deletedImageIds, []);
});

test('touchEntry moves an entry to the top with the new time', () => {
  // Arrange
  const history = historyOf(textEntry('c', 300), textEntry('b', 200), textEntry('a', 100));

  // Act
  const result = touchEntry(history, 'a', 500);

  // Assert
  assert.deepEqual(ids(result), ['a', 'c', 'b']);
  assert.equal(result.entries[0]?.createdAt, 500);
});

test('touchEntry gives the same history for an unknown id', () => {
  // Arrange
  const history = historyOf(textEntry('a', 100));

  // Act
  const result = touchEntry(history, 'missing', 500);

  // Assert
  assert.equal(result, history);
});

test('togglePinned pins an unpinned entry and unpins a pinned one without moving it', () => {
  // Arrange
  const history = historyOf(textEntry('b', 200), textEntry('a', 100, true));

  // Act
  const result = togglePinned(togglePinned(history, 'b'), 'a');

  // Assert
  assert.deepEqual(ids(result), ['b', 'a']);
  assert.equal(result.entries[0]?.pinned, true);
  assert.equal(result.entries[1]?.pinned, false);
});

test('togglePinned gives the same history for an unknown id', () => {
  // Arrange
  const history = historyOf(textEntry('a', 100));

  // Act
  const result = togglePinned(history, 'missing');

  // Assert
  assert.equal(result, history);
});

test('pruneHistory evicts the oldest unpinned entries after the limit is lowered', () => {
  // Arrange
  const history = historyOf(
    textEntry('e', 500),
    imageEntry('d', 400),
    textEntry('c', 300, true),
    imageEntry('b', 200),
    textEntry('a', 100),
  );

  // Act
  const change = pruneHistory(history, { ...settings, maxEntries: 2 });

  // Assert
  assert.deepEqual(ids(change.history), ['e', 'c']);
  assert.deepEqual(change.deletedImageIds, ['d', 'b']);
});

test('pruneHistory gives the same history when it is within the limit', () => {
  // Arrange
  const history = historyOf(textEntry('b', 200), textEntry('a', 100));

  // Act
  const change = pruneHistory(history, settings);

  // Assert
  assert.equal(change.history, history);
  assert.deepEqual(change.deletedImageIds, []);
});

test('pruneHistory keeps the history when all entries over the limit are pinned', () => {
  // Arrange
  const history = historyOf(textEntry('b', 200, true), textEntry('a', 100, true));

  // Act
  const change = pruneHistory(history, { ...settings, maxEntries: 1 });

  // Assert
  assert.equal(change.history, history);
  assert.deepEqual(change.deletedImageIds, []);
});
