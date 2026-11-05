import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyVersion, parseHistory, serializeHistory, type History } from '../src/index.js';

const history: History = {
  entries: [
    {
      id: 'b',
      type: 'image',
      createdAt: 200,
      image: { width: 640, height: 480, bytes: 12345 },
      app: { name: 'Firefox', wmClass: 'firefox' },
      pinned: true,
      hash: 'hash-b',
    },
    { id: 'a', type: 'link', createdAt: 100, text: 'https://example.com', pinned: false, hash: 'hash-a' },
  ],
};

test('serializeHistory gives a versioned object', () => {
  // Act
  const value = serializeHistory(history) as { version: unknown; entries: unknown };

  // Assert
  assert.equal(value.version, historyVersion);
  assert.equal(value.version, 1);
  assert.deepEqual(value.entries, history.entries);
});

test('parseHistory reads back what serializeHistory wrote through JSON', () => {
  // Arrange
  const json = JSON.stringify(serializeHistory(history));

  // Act
  const result = parseHistory(JSON.parse(json));

  // Assert
  assert.deepEqual(result, history);
});

test('parseHistory throws for an unknown version', () => {
  // Act and Assert
  assert.throws(() => parseHistory({ version: 2, entries: [] }), /unsupported history version 2/);
});

test('parseHistory throws for a missing version', () => {
  // Act and Assert
  assert.throws(() => parseHistory({ entries: [] }), /unsupported history version/);
});

for (const value of [null, 'text', 42, [], undefined]) {
  test(`parseHistory throws for the value ${JSON.stringify(value)}`, () => {
    // Act and Assert
    assert.throws(() => parseHistory(value), /history is not an object/);
  });
}

test('parseHistory throws when entries is not a list', () => {
  // Act and Assert
  assert.throws(() => parseHistory({ version: 1, entries: {} }), /history entries is not a list/);
});

test('parseHistory ignores unknown extra fields', () => {
  // Arrange
  const value = {
    version: 1,
    extra: true,
    entries: [
      {
        id: 'a',
        type: 'text',
        createdAt: 1,
        text: 'x',
        pinned: false,
        hash: 'h',
        future: 'field',
        app: { name: 'App', wmClass: 'app', icon: 'x' },
      },
    ],
  };

  // Act
  const result = parseHistory(value);

  // Assert
  assert.deepEqual(result, {
    entries: [
      { id: 'a', type: 'text', createdAt: 1, text: 'x', pinned: false, hash: 'h', app: { name: 'App', wmClass: 'app' } },
    ],
  });
});

const valid = { id: 'ok', type: 'text', createdAt: 1, text: 'x', pinned: false, hash: 'h' };

const invalidEntries: Array<[string, unknown]> = [
  ['a non-object', 'text'],
  ['a null', null],
  ['an empty id', { ...valid, id: '' }],
  ['an unknown type', { ...valid, type: 'audio' }],
  ['a createdAt that is not a number', { ...valid, createdAt: '1' }],
  ['a pinned that is not a boolean', { ...valid, pinned: 'yes' }],
  ['a missing hash', { id: 'x', type: 'text', createdAt: 1, text: 'x', pinned: false }],
  ['a text entry without text', { ...valid, text: undefined }],
  ['an image entry without image info', { ...valid, type: 'image', text: undefined }],
  ['image info with a bad size', { ...valid, type: 'image', image: { width: 1, height: 1, bytes: 'big' } }],
  ['an app without a wmClass', { ...valid, app: { name: 'App' } }],
  ['an app that is not an object', { ...valid, app: 'App' }],
];

for (const [name, entry] of invalidEntries) {
  test(`parseHistory drops an entry with ${name} and keeps the others`, () => {
    // Arrange
    const value = { version: 1, entries: [entry, valid] };

    // Act
    const result = parseHistory(value);

    // Assert
    assert.deepEqual(result.entries, [valid]);
  });
}
