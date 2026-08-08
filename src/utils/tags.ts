export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_ENTRY = 8;

/**
 * Tags are compared case-insensitively and stored lowercase so "Books",
 * "books" and " BOOKS " all land in the same bucket.
 */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_TAG_LENGTH)
    .toLowerCase()
    .trim();
}

/** Splits user or model input on commas, newlines and hashes into clean tags. */
export function parseTags(input: string): string[] {
  return dedupe(input.split(/[,\n;#]+/).map(normalizeTag).filter(Boolean));
}

export function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function addTag(tags: string[], candidate: string): string[] {
  const tag = normalizeTag(candidate);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS_PER_ENTRY) return tags;
  return [...tags, tag];
}

export function removeTag(tags: string[], candidate: string): string[] {
  return tags.filter((tag) => tag !== candidate);
}

/** Title-cases a tag for display without changing what is stored. */
export function displayTag(tag: string): string {
  return tag.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Deterministic backstop for tag suggestions: any tag already used in the
 * library that also appears as a whole word (or phrase) in the note text,
 * most-used first. This catches exactly what a small model tends to miss:
 * reusing a tag that is sitting right there in the text, for free, and
 * without needing the model to be right about anything. Meant to be merged
 * with the model's own suggestions, not to replace them.
 */
export function matchKnownTags(text: string, known: { tag: string; count: number }[]): string[] {
  const lower = text.normalize('NFKC').toLowerCase();
  return known
    .filter(({ tag }) => {
      const normalized = tag.normalize('NFKC').toLowerCase();
      const boundary = '[^\\p{L}\\p{M}\\p{N}_]';
      return new RegExp(`(?:^|${boundary})${escapeRegExp(normalized)}(?=$|${boundary})`, 'u').test(lower);
    })
    .sort((a, b) => b.count - a.count)
    .map(({ tag }) => tag);
}
