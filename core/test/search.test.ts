import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dayKeyInTimeZone,
  dayLabel,
  filterEntries,
  groupByDay,
  type Entry,
  type EntryType,
} from '../src/index.js';

function entry(id: string, type: EntryType, text: string | undefined, appName?: string): Entry {
  const result: Entry = { id, type, createdAt: 0, pinned: false, hash: id };
  if (text !== undefined) {
    result.text = text;
  }
  if (type === 'image') {
    result.image = { width: 1, height: 1, bytes: 1 };
  }
  if (appName !== undefined) {
    result.app = { name: appName, wmClass: appName.toLowerCase() };
  }
  return result;
}

const entries: Entry[] = [
  entry('1', 'text', 'Hello World', 'Text Editor'),
  entry('2', 'link', 'https://example.com/hello'),
  entry('3', 'image', undefined, 'Firefox'),
  entry('4', 'color', '#FFAA00'),
  entry('5', 'text', 'goodbye'),
];

function ids(list: readonly Entry[]): string[] {
  return list.map((item) => item.id);
}

test('filterEntries matches text case-insensitively and keeps the order', () => {
  // Act
  const result = filterEntries(entries, 'HELLO', null);

  // Assert
  assert.deepEqual(ids(result), ['1', '2']);
});

test('filterEntries gives all entries for an empty or whitespace query', () => {
  // Act
  const empty = filterEntries(entries, '', null);
  const blank = filterEntries(entries, '   ', null);

  // Assert
  assert.deepEqual(ids(empty), ['1', '2', '3', '4', '5']);
  assert.deepEqual(ids(blank), ['1', '2', '3', '4', '5']);
});

test('filterEntries filters by type', () => {
  // Act
  const result = filterEntries(entries, '', 'text');

  // Assert
  assert.deepEqual(ids(result), ['1', '5']);
});

test('filterEntries combines the type and the query', () => {
  // Act
  const result = filterEntries(entries, 'hello', 'link');

  // Assert
  assert.deepEqual(ids(result), ['2']);
});

test('filterEntries gives images for the image type and an empty query', () => {
  // Act
  const result = filterEntries(entries, '', 'image');

  // Assert
  assert.deepEqual(ids(result), ['3']);
});

test('filterEntries matches the app name, also for images', () => {
  // Act
  const result = filterEntries(entries, 'firefox', null);

  // Assert
  assert.deepEqual(ids(result), ['3']);
});

test('filterEntries gives no image for a query that only text can match', () => {
  // Act
  const result = filterEntries(entries, 'aa00', null);

  // Assert
  assert.deepEqual(ids(result), ['4']);
});

function timed(id: string, createdAt: number): Entry {
  return { id, type: 'text', createdAt, text: id, pinned: false, hash: id };
}

// A day key that uses UTC, so the tests do not depend on the machine time zone.
function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

test('groupByDay groups consecutive entries by day with the newest group first', () => {
  // Arrange
  const list = [
    timed('c', Date.UTC(2026, 10, 5, 12)),
    timed('b', Date.UTC(2026, 10, 5, 1)),
    timed('a', Date.UTC(2026, 10, 3, 23)),
  ];

  // Act
  const groups = groupByDay(list, utcDayKey);

  // Assert
  assert.deepEqual(
    groups.map((group) => ({ day: group.day, ids: ids(group.entries) })),
    [
      { day: '2026-11-05', ids: ['c', 'b'] },
      { day: '2026-11-03', ids: ['a'] },
    ],
  );
});

test('groupByDay gives no groups for no entries', () => {
  // Act
  const groups = groupByDay([], utcDayKey);

  // Assert
  assert.deepEqual(groups, []);
});

test('dayKeyInTimeZone gives the date in the given time zone', () => {
  // Arrange
  const lateEveningUtc = Date.UTC(2026, 10, 5, 23, 30);

  // Act
  const helsinki = dayKeyInTimeZone('Europe/Helsinki')(lateEveningUtc);
  const newYork = dayKeyInTimeZone('America/New_York')(lateEveningUtc);
  const utc = dayKeyInTimeZone('UTC')(lateEveningUtc);

  // Assert
  assert.equal(helsinki, '2026-11-06');
  assert.equal(newYork, '2026-11-05');
  assert.equal(utc, '2026-11-05');
});

test('dayKeyInTimeZone throws for an unknown time zone', () => {
  // Act and Assert
  assert.throws(() => dayKeyInTimeZone('Not/AZone'), RangeError);
});

const labelCases: Array<[string, string, string]> = [
  ['2026-11-05', '2026-11-05', 'Today'],
  ['2026-11-04', '2026-11-05', 'Yesterday'],
  ['2026-11-03', '2026-11-05', '2026-11-03'],
  ['2026-10-31', '2026-11-01', 'Yesterday'],
  ['2025-12-31', '2026-01-01', 'Yesterday'],
  ['2024-02-29', '2024-03-01', 'Yesterday'],
];

for (const [day, today, expected] of labelCases) {
  test(`dayLabel gives '${expected}' for ${day} when today is ${today}`, () => {
    // Act
    const label = dayLabel(day, today);

    // Assert
    assert.equal(label, expected);
  });
}

test('filterEntries trims the query before it matches', () => {
  // Act
  const result = filterEntries(entries, '  goodbye ', null);

  // Assert
  assert.deepEqual(ids(result), ['5']);
});
