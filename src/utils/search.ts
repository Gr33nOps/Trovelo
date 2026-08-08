import { Entry } from '../types';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'it',
  'this', 'that', 'with', 'as', 'at', 'by', 'be', 'are', 'was', 'were', 'i',
  'my', 'me', 'you', 'your', 'we', 'our', 'so', 'but', 'not', 'have', 'has',
]);

function words(text: string): string[] {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}']+/gu) ?? [];
}

/**
 * True when `a` and `b` are the same word, or one edit (substitution,
 * insertion or deletion) apart. Only applied to words of five letters or more
 * so short words like "am" and "an" do not collide.
 */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  let i = 0;
  let j = 0;
  let mismatches = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    mismatches += 1;
    if (mismatches > 1) return false;
    if (a.length === b.length) {
      i += 1;
      j += 1;
    } else if (a.length > b.length) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return true;
}

export interface Searchable {
  title?: string;
  text: string;
  tags: string[];
}

interface FieldWords {
  title: string[];
  body: string[];
  tags: string[];
}

function tokenize(entry: Searchable): FieldWords {
  return {
    title: words(entry.title ?? ''),
    body: words(entry.text),
    tags: entry.tags.flatMap(words),
  };
}

function scoreAgainstField(word: string, field: string[], exact: number, prefix: number, fuzzy: number): number {
  let best = 0;
  for (const candidate of field) {
    if (candidate === word) return exact;
    if (candidate.length > 2 && (candidate.startsWith(word) || word.startsWith(candidate))) {
      best = Math.max(best, prefix);
    } else if (closeEnough(word, candidate)) {
      best = Math.max(best, fuzzy);
    }
  }
  return best;
}

/**
 * Scores one entry against a query. Every query word must match somewhere
 * (title, tags or body) or the entry does not match at all, the same "every
 * word must appear" behaviour the old plain substring search had. What
 * changes is that a title or tag hit now outranks the same word only
 * appearing in the body, and a near-miss (a missing letter, a typo) still
 * counts for something instead of failing the whole search.
 */
export function scoreEntry(entry: Searchable, queryWords: readonly string[]): number {
  if (queryWords.length === 0) return 1;
  const fields = tokenize(entry);
  let total = 0;
  for (const word of queryWords) {
    const titleScore = scoreAgainstField(word, fields.title, 6, 4, 2);
    const tagScore = scoreAgainstField(word, fields.tags, 5, 3, 1.5);
    const bodyScore = scoreAgainstField(word, fields.body, 2, 1, 0.5);
    const best = Math.max(titleScore, tagScore, bodyScore);
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** Ranks entries against a query, best match first. Empty query returns the input order. */
export function searchEntries<T extends Searchable>(entries: readonly T[], query: string): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...entries];
  const queryWords = words(trimmed);
  if (queryWords.length === 0) return [...entries];

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, queryWords) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.entry);
}

/**
 * Finds entries that share tags or distinctive words with `target`. Pure
 * word overlap, no model required, so it works the same with or without an
 * assistant installed.
 */
export function findRelated(entries: readonly Entry[], target: Entry, limit = 4): Entry[] {
  const targetTags = new Set(target.tags);
  const targetWords = new Set(
    [...words(target.title ?? ''), ...words(target.text)].filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
  if (targetTags.size === 0 && targetWords.size === 0) return [];

  const scored = entries
    .filter((entry) => entry.id !== target.id && !entry.archivedAt)
    .map((entry) => {
      const tagOverlap = entry.tags.filter((tag) => targetTags.has(tag)).length;
      const entryWords = [...words(entry.title ?? ''), ...words(entry.text)].filter(
        (w) => w.length > 3 && !STOP_WORDS.has(w),
      );
      let wordOverlap = 0;
      const seen = new Set<string>();
      for (const w of entryWords) {
        if (seen.has(w)) continue;
        seen.add(w);
        if (targetWords.has(w)) wordOverlap += 1;
      }
      return { entry, score: tagOverlap * 4 + wordOverlap };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt);

  return scored.slice(0, limit).map((item) => item.entry);
}
