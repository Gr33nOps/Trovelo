import { Entry } from '../types';

export function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const DAY = 86_400_000;

/**
 * Scores how much an idea deserves to resurface.
 *
 * Pure uniform random makes the box feel repetitive and keeps handing back
 * things you have already dealt with. Weighting by neglect (how long since it
 * was last seen, how rarely it has come up) is what makes the feature feel
 * like rediscovery rather than a shuffle.
 */
function weightFor(entry: Entry, now: number): number {
  // Explicitly dismissed ideas stay in the library but stop coming up.
  if (entry.status === 'not_useful') return 0;
  // Archived entries are put away.
  if (entry.archivedAt) return 0;

  const lastSeen = entry.lastViewedAt ?? entry.createdAt;
  const daysSinceSeen = Math.max(0, (now - lastSeen) / DAY);
  const daysSinceSaved = Math.max(0, (now - entry.createdAt) / DAY);

  // Grows with neglect but flattens out, so a two-year-old note does not
  // permanently crowd out everything else.
  let weight = 1 + Math.log1p(daysSinceSeen) * 2;

  // Things seen many times already are less of a surprise.
  weight /= 1 + entry.timesRediscovered * 0.6;

  if (entry.status === 'done') weight *= 0.25;
  if (entry.status === 'interesting') weight *= 1.5;
  if (entry.isFavorite) weight *= 1.3;

  // Give something saved minutes ago a moment to settle before it returns.
  if (daysSinceSaved < 0.5) weight *= 0.3;

  return Math.max(0.01, weight);
}

/**
 * Picks the next idea to reveal, skipping anything in `recentIds`.
 * Returns null only when there is genuinely nothing to show.
 */
export function pickSurprise(entries: readonly Entry[], recentIds: readonly string[]): Entry | null {
  if (entries.length === 0) return null;

  const recent = new Set(recentIds);
  const now = Date.now();

  const build = (pool: readonly Entry[]) =>
    pool.map((entry) => ({ entry, weight: weightFor(entry, now) })).filter((item) => item.weight > 0);

  // Widen the net only as far as needed: unseen-recently first, then all
  // eligible entries. Explicitly dismissed entries never resurface.
  const eligible = entries.filter((entry) => !entry.archivedAt);
  let candidates = build(eligible.filter((entry) => !recent.has(entry.id)));
  if (candidates.length === 0) candidates = build(eligible);
  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of candidates) {
    cursor -= item.weight;
    if (cursor <= 0) return item.entry;
  }
  return candidates.at(-1)!.entry;
}
