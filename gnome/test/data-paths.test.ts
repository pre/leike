import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dataDir, historyFile, imageFile, imagesDir } from '../src/data-paths.ts';

describe('data paths', () => {
  test('are under leike in the user data directory', () => {
    assert.equal(dataDir('/home/user/.local/share'), '/home/user/.local/share/leike');
    assert.equal(historyFile('/home/user/.local/share'), '/home/user/.local/share/leike/history.json');
    assert.equal(imagesDir('/home/user/.local/share'), '/home/user/.local/share/leike/images');
  });

  test('use XDG_DATA_HOME when the caller gives it', () => {
    assert.equal(historyFile('/srv/xdg-data'), '/srv/xdg-data/leike/history.json');
  });

  test('ignore a slash at the end of the user data directory', () => {
    assert.equal(dataDir('/home/user/.local/share/'), '/home/user/.local/share/leike');
  });

  test('name an image file by the entry id', () => {
    assert.equal(imageFile('/d', '01JC0000000000000000000000'), '/d/leike/images/01JC0000000000000000000000.png');
  });
});
