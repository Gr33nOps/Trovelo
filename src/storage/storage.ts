import AsyncStorage from '@react-native-async-storage/async-storage';

import { Category, Entry, FollowUp, Preferences, isAccentId, isEntryStatus } from '../types';
import { DEFAULT_ACCENT_ID } from '../constants/theme';
import { MAX_TAGS_PER_ENTRY, normalizeTag } from '../utils/tags';

const ENTRIES_KEY = '@trovelo/entries/v1';
const PREFS_KEY = '@trovelo/prefs/v1';
const CATEGORIES_KEY = '@trovelo/categories/v1';

/** Single record holding app preferences (currently just haptics). */
export const SETTINGS_KEY = '@trovelo/settings/v2';

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
} as const;

const MIGRATION_PAIRS: readonly (readonly [string, string])[] = [
  [ENTRIES_KEY, LEGACY.entries],
  [PREFS_KEY, LEGACY.prefs],
  [CATEGORIES_KEY, LEGACY.categories],
  [SETTINGS_KEY, LEGACY.settings],
];

const LEGACY_STORAGE_KEYS = Object.values(LEGACY);

/** Every AsyncStorage key owned by the app, including transitional v1 keys. */
export const STORAGE_KEYS = [
  ENTRIES_KEY,
  PREFS_KEY,
  CATEGORIES_KEY,
  SETTINGS_KEY,
  ...LEGACY_STORAGE_KEYS,
] as const;

/**
 * Moves any data left under the old `@serendipity/*` keys to its `@trovelo/*`
 * replacement. Runs before the providers mount. Removing the source keys after
 * a successful copy is important: otherwise a later reset could remove the new
 * record and the next startup would resurrect the supposedly deleted old one.
 */
export async function migrateLegacyKeys(): Promise<void> {
  try {
    const currentKeys = MIGRATION_PAIRS.map(([current]) => current);
    const legacyKeys = MIGRATION_PAIRS.map(([, legacy]) => legacy);
    const [currentValues, legacyValues] = await Promise.all([
      AsyncStorage.multiGet([...currentKeys]),
      AsyncStorage.multiGet([...legacyKeys]),
    ]);
    const currentByKey = new Map(currentValues);
    const legacyByKey = new Map(legacyValues);
    const writes: [string, string][] = [];
    for (const [key, legacy] of MIGRATION_PAIRS) {
      const currentValue = currentByKey.get(key);
      if (currentValue !== null && currentValue !== undefined) continue;
      const value = legacyByKey.get(legacy);
      if (value !== null && value !== undefined) writes.push([key, value]);
    }
    if (writes.length > 0) await AsyncStorage.multiSet(writes);
    await AsyncStorage.multiRemove([...legacyKeys]);
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
const pending = new Map<string, string>();
const flushing = new Map<string, Promise<void>>();

function writeJson(key: string, value: unknown): Promise<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return Promise.reject(error);
  }

  pending.set(key, serialized);
  return startFlush(key);
}

function startFlush(key: string): Promise<void> {
  const inFlight = flushing.get(key);
  if (inFlight) return inFlight;

  const run = (async () => {
    let firstError: unknown;
    try {
      while (pending.has(key)) {
        const next = pending.get(key);
        pending.delete(key);
        if (next === undefined) continue;
        try {
          await AsyncStorage.setItem(key, next);
        } catch (error) {
          firstError ??= error;
          // If a newer snapshot arrived while this write was in flight, try it
          // now. Otherwise retain the failed snapshot for the next mutation or
          // an explicit flush instead of silently losing it.
          if (!pending.has(key)) {
            pending.set(key, next);
            break;
          }
        }
      }
      if (firstError !== undefined) throw firstError;
    } finally {
      flushing.delete(key);
    }
  })();

  flushing.set(key, run);
  return run;
}

/** Resolves once every queued write has landed. Used before export/reset. */
export async function flushPendingWrites(): Promise<void> {
  for (const key of pending.keys()) {
    if (!flushing.has(key)) void startFlush(key);
  }
  await Promise.all([...flushing.values()]);
}

async function readJson<T>(key: string, legacyKey?: string): Promise<T | null> {
  try {
    let raw = await AsyncStorage.getItem(key);
    let migratedFromLegacy = false;
    if (raw === null && legacyKey) {
      raw = await AsyncStorage.getItem(legacyKey);
      migratedFromLegacy = raw !== null;
    }
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as T;
    if (migratedFromLegacy && legacyKey) {
      // A failed startup batch migration must not make providers hydrate empty
      // state and then overwrite the still-valid legacy record. Promote this
      // individual value before returning it as writable state.
      await AsyncStorage.setItem(key, raw);
      await AsyncStorage.removeItem(legacyKey).catch((error) => {
        if (__DEV__) console.warn(`[storage] failed to remove migrated key ${legacyKey}`, error);
      });
    }
    return parsed;
  } catch (error) {
    if (__DEV__) console.warn(`[storage] failed to read ${key}`, error);
    throw error;
  }
}

function fallbackId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeFollowUps(raw: unknown): FollowUp[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: FollowUp[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text.trim() : '';
    if (!text) continue;
    let id = typeof record.id === 'string' && record.id ? record.id : fallbackId();
    while (seen.has(id)) id = fallbackId();
    seen.add(id);
    out.push({
      id,
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
              .map(normalizeTag)
              .filter(Boolean),
          ),
        ).slice(0, MAX_TAGS_PER_ENTRY)
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
  const name = typeof record.name === 'string' ? record.name.trim().slice(0, 40).trim() : '';
  if (!name) return null;
  return {
    id: typeof record.id === 'string' && record.id ? record.id : fallbackId(),
    name,
    createdAt:
      typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
  };
}

export async function loadEntries(): Promise<Entry[]> {
  const raw = await readJson<unknown>(ENTRIES_KEY, LEGACY.entries);
  if (raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('Stored entries are not an array.');
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
  const raw = await readJson<unknown>(CATEGORIES_KEY, LEGACY.categories);
  if (raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('Stored categories are not an array.');
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
  const raw = await readJson<unknown>(PREFS_KEY, LEGACY.prefs);
  if (raw === null) return { ...DEFAULT_PREFERENCES };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Stored preferences are not an object.');
  }
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

export function loadSettingsRecord(): Promise<unknown | null> {
  return readJson<unknown>(SETTINGS_KEY, LEGACY.settings);
}

export function saveSettingsRecord(settings: unknown): Promise<void> {
  return writeJson(SETTINGS_KEY, settings);
}

async function removeStoredKeys(keys: readonly string[]): Promise<void> {
  for (const key of keys) pending.delete(key);
  await Promise.allSettled(
    keys.map((key) => flushing.get(key)).filter((run): run is Promise<void> => run !== undefined),
  );
  // A failed in-flight write may have restored its value to `pending`.
  for (const key of keys) pending.delete(key);
  await AsyncStorage.multiRemove([...keys]);
}

export function clearStoredSettings(): Promise<void> {
  return removeStoredKeys([SETTINGS_KEY, LEGACY.settings]);
}

export function clearStoredPreferences(): Promise<void> {
  return removeStoredKeys([PREFS_KEY, LEGACY.prefs]);
}

export async function clearAllStoredData(): Promise<void> {
  await removeStoredKeys(STORAGE_KEYS);
}
