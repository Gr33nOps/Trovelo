import AsyncStorage from '@react-native-async-storage/async-storage';

import { Category, Entry, FollowUp, Preferences, isAccentId, isEntryKind, isEntryStatus } from '../types';
import { DEFAULT_ACCENT_ID } from '../constants/theme';

const ENTRIES_KEY = '@trovelo/entries/v1';
const PREFS_KEY = '@trovelo/prefs/v1';
const CATEGORIES_KEY = '@trovelo/categories/v1';

/** Single record holding assistant/haptics/voice preferences. */
export const SETTINGS_KEY = '@trovelo/settings/v2';

/** Pre-settings-record keys (also renamed for the Trovelo rebrand). */
export const LEGACY_AI_KEYS = {
  aiEnabled: '@trovelo/aiEnabled/v1',
  modelPath: '@trovelo/aiModelPath/v1',
  modelId: '@trovelo/aiModel/v1',
} as const;

/** Resume token for an interrupted model download. */
export const MODEL_DOWNLOAD_KEY = '@trovelo/modelDownload/v1';

export const STORAGE_KEYS = [ENTRIES_KEY, PREFS_KEY, CATEGORIES_KEY] as const;

/**
 * Keys written by the pre-Trovelo builds. Values are moved to the `@trovelo/*`
 * keys the first time this version runs, so an update does not look like a
 * fresh install.
 */
const LEGACY = {
  entries: '@serendipity/entries/v1',
  prefs: '@serendipity/prefs/v1',
  categories: '@serendipity/categories/v1',
  settings: '@serendipity/settings/v2',
  aiEnabled: '@serendipity/aiEnabled/v1',
  modelPath: '@serendipity/aiModelPath/v1',
  modelId: '@serendipity/aiModel/v1',
  modelDownload: '@serendipity/modelDownload/v1',
} as const;

const MIGRATION_PAIRS: ReadonlyArray<readonly [string, string]> = [
  [ENTRIES_KEY, LEGACY.entries],
  [PREFS_KEY, LEGACY.prefs],
  [CATEGORIES_KEY, LEGACY.categories],
  [SETTINGS_KEY, LEGACY.settings],
  [LEGACY_AI_KEYS.aiEnabled, LEGACY.aiEnabled],
  [LEGACY_AI_KEYS.modelPath, LEGACY.modelPath],
  [LEGACY_AI_KEYS.modelId, LEGACY.modelId],
  [MODEL_DOWNLOAD_KEY, LEGACY.modelDownload],
];

/**
 * Copies any data left under the old `@serendipity/*` keys to their `@trovelo/*`
 * replacements. Runs once, before the providers mount, so a rebranded update
 * keeps every entry, folder, preference and download resume token.
 */
export async function migrateLegacyKeys(): Promise<void> {
  try {
    const legacyKeys = MIGRATION_PAIRS.map(([, legacy]) => legacy);
    const values = await AsyncStorage.multiGet([...legacyKeys]);
    const writes: Array<[string, string]> = [];
    for (const [key, legacy] of MIGRATION_PAIRS) {
      if ((await AsyncStorage.getItem(key)) !== null) continue;
      const value = values.find(([stored]) => stored === legacy)?.[1];
      if (value !== null && value !== undefined) writes.push([key, value]);
    }
    if (writes.length > 0) await AsyncStorage.multiSet(writes);
  } catch (error) {
    if (__DEV__) console.warn('[storage] legacy key migration failed', error);
  }
}

export const DEFAULT_PREFERENCES: Preferences = {
  themeMode: 'system',
  accentId: DEFAULT_ACCENT_ID,
  streak: 0,
  lastOpenDay: null,
  bestStreak: 0,
  daysOpened: 0,
  onboarded: false,
};

/**
 * Writes are coalesced per key and run one at a time.
 *
 * Every mutation used to fire its own `setItem` with the full array, so two
 * rapid edits could interleave and the older snapshot could land last. Keeping
 * only the newest pending value per key also avoids re-serialising the whole
 * library on each keystroke-speed change.
 */
const pending = new Map<string, unknown>();
const flushing = new Map<string, Promise<void>>();

function writeJson(key: string, value: unknown): Promise<void> {
  pending.set(key, value);
  const inFlight = flushing.get(key);
  if (inFlight) return inFlight;

  const run = (async () => {
    try {
      while (pending.has(key)) {
        const next = pending.get(key);
        pending.delete(key);
        await AsyncStorage.setItem(key, JSON.stringify(next));
      }
    } catch (error) {
      if (__DEV__) console.warn(`[storage] failed to persist ${key}`, error);
    } finally {
      flushing.delete(key);
    }
  })();

  flushing.set(key, run);
  return run;
}

/** Resolves once every queued write has landed. Used before export/reset. */
export async function flushPendingWrites(): Promise<void> {
  await Promise.all([...flushing.values()]);
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    if (__DEV__) console.warn(`[storage] failed to read ${key}`, error);
    return null;
  }
}

function fallbackId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFollowUps(raw: unknown): FollowUp[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: FollowUp[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!text) continue;
    out.push({
      id: typeof record.id === 'string' && record.id ? record.id : fallbackId(),
      at: typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now(),
      text,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Coerces whatever is on disk into a valid Entry. Stored data can predate the
 * current shape or have been hand-edited via a restored backup, and a single
 * malformed record used to be enough to crash a render deep in a list.
 */
export function normalizeEntry(raw: unknown): Entry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const text = typeof record.text === 'string' ? record.text : '';
  if (!text.trim()) return null;

  const now = Date.now();
  const createdAt = typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : now;
  const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim() : undefined;

  return {
    id: typeof record.id === 'string' && record.id ? record.id : fallbackId(),
    title,
    text,
    createdAt,
    updatedAt:
      typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : createdAt,
    status: isEntryStatus(record.status) ? record.status : 'new',
    isFavorite: record.isFavorite === true,
    tags: Array.isArray(record.tags)
      ? Array.from(
          new Set(
            record.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        )
      : [],
    categoryId: typeof record.categoryId === 'string' && record.categoryId ? record.categoryId : undefined,
    timesRediscovered:
      typeof record.timesRediscovered === 'number' && Number.isFinite(record.timesRediscovered)
        ? Math.max(0, Math.floor(record.timesRediscovered))
        : 0,
    lastViewedAt:
      typeof record.lastViewedAt === 'number' && Number.isFinite(record.lastViewedAt)
        ? record.lastViewedAt
        : undefined,
    kind: isEntryKind(record.kind) && record.kind !== 'idea' ? record.kind : undefined,
    dueAt: typeof record.dueAt === 'number' && Number.isFinite(record.dueAt) ? record.dueAt : undefined,
    remindAt:
      typeof record.remindAt === 'number' && Number.isFinite(record.remindAt) ? record.remindAt : undefined,
    archivedAt:
      typeof record.archivedAt === 'number' && Number.isFinite(record.archivedAt)
        ? record.archivedAt
        : undefined,
    isPinned: record.isPinned === true ? true : undefined,
    followUps: normalizeFollowUps(record.followUps),
  };
}

export function normalizeCategory(raw: unknown): Category | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name) return null;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : fallbackId(),
    name,
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
  };
}

export async function loadEntries(): Promise<Entry[]> {
  const raw = await readJson<unknown>(ENTRIES_KEY);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const item of raw) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

export function saveEntries(entries: Entry[]): Promise<void> {
  return writeJson(ENTRIES_KEY, entries);
}

export async function loadCategories(): Promise<Category[]> {
  const raw = await readJson<unknown>(CATEGORIES_KEY);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const categories: Category[] = [];
  for (const item of raw) {
    const category = normalizeCategory(item);
    if (!category || seen.has(category.id)) continue;
    seen.add(category.id);
    categories.push(category);
  }
  return categories;
}

export function saveCategories(categories: Category[]): Promise<void> {
  return writeJson(CATEGORIES_KEY, categories);
}

export async function loadPreferences(): Promise<Preferences> {
  const raw = await readJson<unknown>(PREFS_KEY);
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PREFERENCES };
  const prefs = raw as Record<string, unknown>;
  const number = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
  const streak = number(prefs.streak, 0);
  return {
    themeMode:
      prefs.themeMode === 'light' || prefs.themeMode === 'dark' || prefs.themeMode === 'system'
        ? prefs.themeMode
        : 'system',
    accentId: isAccentId(prefs.accentId) ? prefs.accentId : DEFAULT_ACCENT_ID,
    streak,
    lastOpenDay: typeof prefs.lastOpenDay === 'string' ? prefs.lastOpenDay : null,
    bestStreak: Math.max(streak, number(prefs.bestStreak, 0)),
    daysOpened: number(prefs.daysOpened, 0),
    onboarded: prefs.onboarded === true,
  };
}

export function savePreferences(prefs: Preferences): Promise<void> {
  return writeJson(PREFS_KEY, prefs);
}

export async function clearAllStoredData(): Promise<void> {
  pending.clear();
  await flushPendingWrites();
  await AsyncStorage.multiRemove([...STORAGE_KEYS]);
}
