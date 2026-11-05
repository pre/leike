import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const metadata = JSON.parse(readFileSync(new URL('../metadata.json', import.meta.url), 'utf8'));
const schemaId: string = metadata['settings-schema'];
const schemaFile = new URL(`../schemas/${schemaId}.gschema.xml`, import.meta.url);

test('the schema file has the id that metadata.json names', () => {
  assert.match(readFileSync(schemaFile, 'utf8'), new RegExp(`<schema id="${schemaId}" path="/org/gnome/shell/extensions/leike/">`));
});

test('the uuid is leike@repo.pet', () => {
  assert.equal(metadata.uuid, 'leike@repo.pet');
});
