import assert from 'node:assert/strict';
import test from 'node:test';

import type { Entry } from '../src/types';
import { searchEntries } from '../src/utils/search';
import { matchKnownTags, normalizeTag, parseTags } from '../src/utils/tags';

function entry(id: string, patch: Partial<Entry> = {}): Entry {
  return {
    id,
    text: `Entry ${id}`,
    createdAt: Date.now() - 86_400_000,
    updatedAt: Date.now() - 86_400_000,
    status: 'new',
    isFavorite: false,
    tags: [],
    timesRediscovered: 0,
    ...patch,
  };
}

test('search indexes non-ASCII words instead of treating the query as empty', () => {
  const entries = [
    entry('latin', { title: 'Café plans' }),
    entry('urdu', { title: 'سفر کی تیاری' }),
    entry('other', { title: 'Gardening notes' }),
  ];

  assert.deepEqual(searchEntries(entries, 'café').map(({ id }) => id), ['latin']);
  assert.deepEqual(searchEntries(entries, 'سفر').map(({ id }) => id), ['urdu']);
});

test('known-tag matching uses Unicode-aware word boundaries', () => {
  const known = [
    { tag: 'سفر', count: 2 },
    { tag: 'café', count: 1 },
  ];

  assert.deepEqual(matchKnownTags('Café notes and سفر plans', known), ['سفر', 'café']);
  assert.deepEqual(matchKnownTags('سفری منصوبہ', known), []);
});

test('tag parsing normalizes, deduplicates, and strips hash prefixes', () => {
  assert.deepEqual(parseTags(' #Books, books;  Travel\nTRAVEL '), ['books', 'travel']);
  assert.equal(normalizeTag('  #A   Long   Tag  '), 'a long tag');
});
