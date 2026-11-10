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

test('filterEntries matches text case-insensitively', () => {
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

function texts(...values: string[]): Entry[] {
  return values.map((text, index) => entry(String(index), 'text', text));
}

test('filterEntries matches a query whose characters are in order but not together', () => {
  // Arrange
  const list = texts('claude --allow', 'goodbye');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['0']);
});

test('filterEntries puts a substring match above a newer scattered match', () => {
  // Arrange
  const list = texts('claude --allow', 'the claws of a cat');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['1', '0']);
});

test('filterEntries ranks a match at the start, then at a word start, then inside a word', () => {
  // Arrange
  const list = texts('reclaim it', 'git claim', 'claim it');

  // Act
  const result = filterEntries(list, 'claim', null);

  // Assert
  assert.deepEqual(ids(result), ['2', '1', '0']);
});

test('filterEntries ranks a scattered match with fewer and shorter gaps higher', () => {
  // Arrange
  const list = texts('cxlxaxw', 'clxaw', 'clxxxaw');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['1', '2', '0']);
});

test('filterEntries keeps the newer entry first when two matches are equal', () => {
  // Arrange
  const list = texts('claude --allow', 'claude --allow!');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['0', '1']);
});

test('filterEntries does not match characters that are far apart in a long text', () => {
  // Arrange
  const filler = 'x'.repeat(300);
  const paragraph = `the cat ${filler} slept ${filler} in a box ${filler} with joy`;

  // Act
  const result = filterEntries(texts(paragraph), 'claw', null);

  // Assert
  assert.deepEqual(ids(result), []);
});

test('filterEntries finds a substring anywhere in a large text, also past the scattered match range', () => {
  // Arrange
  const large = `${'x'.repeat(200_000)} needle`;
  const scattered = `${'x'.repeat(200_000)} n e e d l e`;

  // Act
  const result = filterEntries(texts(large, scattered), 'needle', null);

  // Assert
  assert.deepEqual(ids(result), ['0']);
});

test('filterEntries puts an app name match below a text substring and above a scattered text match', () => {
  // Arrange
  const list = [
    entry('scattered', 'text', 'f-i-r-e'),
    entry('app', 'text', 'something', 'Firefox'),
    entry('text', 'text', 'fire alarm'),
  ];

  // Act
  const result = filterEntries(list, 'fire', null);

  // Assert
  assert.deepEqual(ids(result), ['text', 'app', 'scattered']);
});

test('filterEntries matches the app name only as a substring', () => {
  // Act
  const result = filterEntries(entries, 'ffx', null);

  // Assert
  assert.deepEqual(ids(result), []);
});

test('filterEntries keeps the history order for an empty query, also with pinned entries', () => {
  // Arrange
  const list = texts('a', 'b', 'c');
  list[1] = { ...list[1]!, pinned: true };

  // Act
  const result = filterEntries(list, '', null);

  // Assert
  assert.deepEqual(ids(result), ['0', '1', '2']);
});

test('filterEntries puts a scattered match at the start above a better scattered match deep in a text', () => {
  // Arrange
  const paragraph = `The licensee may use the program. ${'Each party keeps its rights. '.repeat(4)}Any party claiming with this license must give notice.`;
  const list = texts(paragraph, 'claude --allow');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['1', '0']);
});

test('filterEntries ranks a scattered match by its gaps and word starts when both are at the start', () => {
  // Arrange
  const list = texts('claude --allow', 'claiming with');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['1', '0']);
});

test('filterEntries treats regular expression characters in the query as text', () => {
  // Arrange
  const list = texts('axb', 'a.b (c)');

  // Act
  const dot = filterEntries(list, 'a.b', null);
  const brackets = filterEntries(list, '(c)', null);

  // Assert
  assert.deepEqual(ids(dot), ['1']);
  assert.deepEqual(ids(brackets), ['1']);
});

test('filterEntries finds a substring inside a word far into a large text', () => {
  // Arrange
  const large = `${'y'.repeat(5000)}xneedlex${' needlex'.repeat(3)}`;

  // Act
  const result = filterEntries(texts(large), 'needle', null);

  // Assert
  assert.deepEqual(ids(result), ['0']);
});

test('filterEntries ranks a run of characters at a word start above a run inside a word', () => {
  // Arrange
  const list = texts('reclaim with care', 'claude --allow');

  // Act
  const result = filterEntries(list, 'claw', null);

  // Assert
  assert.deepEqual(ids(result), ['1', '0']);
});
