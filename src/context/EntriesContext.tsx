import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import {
  loadCategories,
  loadEntries,
  normalizeCategory,
  normalizeEntry,
  saveCategories,
  saveEntries,
} from '../storage/storage';
import { Category, Entry, EntryPatch, EntryStatus, FollowUp, NewEntryInput } from '../types';
import { generateId } from '../utils/id';
import { MAX_TAGS_PER_ENTRY, normalizeTag } from '../utils/tags';

interface EntriesState {
  entries: Entry[];
  categories: Category[];
  loaded: boolean;
  /** False after a failed/corrupt read so fallback state cannot overwrite recoverable entries. */
  entriesPersistenceReady: boolean;
  /** False after a failed/corrupt read so fallback state cannot overwrite recoverable folders. */
  categoriesPersistenceReady: boolean;
}

type EntriesAction =
  | {
      type: 'hydrate';
      entries: Entry[];
      categories: Category[];
      entriesPersistenceReady: boolean;
      categoriesPersistenceReady: boolean;
    }
  | { type: 'add'; entry: Entry }
  | { type: 'insert'; entries: Entry[] }
  | { type: 'update'; id: string; patch: EntryPatch }
  | { type: 'toggleFavorite'; id: string }
  | { type: 'addFollowUp'; id: string; followUp: FollowUp }
  /** Distinct from 'update': records a Surprise Me / Review reveal without
   *  touching `updatedAt`, so looking at something does not read as editing it. */
  | { type: 'recordView'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'addCategories'; categories: Category[] }
  | { type: 'renameCategory'; id: string; name: string }
  | { type: 'deleteCategory'; id: string };

const INITIAL: EntriesState = {
  entries: [],
  categories: [],
  loaded: false,
  entriesPersistenceReady: false,
  categoriesPersistenceReady: false,
};
const MAX_CATEGORY_NAME_LENGTH = 40;

function normalizedTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).slice(0, MAX_TAGS_PER_ENTRY);
}

function categoryName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Give the folder a name.');
  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) throw new Error('That folder name is too long.');
  return trimmed;
}

/** Collapses duplicate folder names and repairs every entry reference to the canonical id. */
function reconcileLibrary(entries: Entry[], categories: Category[]): { entries: Entry[]; categories: Category[] } {
  const ids = new Set<string>();
  const byName = new Map<string, string>();
  const remap = new Map<string, string>();
  const uniqueCategories: Category[] = [];

  for (const category of categories) {
    if (ids.has(category.id)) continue;
    ids.add(category.id);
    const key = category.name.toLowerCase();
    const existingId = byName.get(key);
    if (existingId) {
      remap.set(category.id, existingId);
      continue;
    }
    byName.set(key, category.id);
    uniqueCategories.push(category);
  }

  return {
    categories: uniqueCategories,
    entries: entries.map((entry) => {
      if (!entry.categoryId) return entry;
      const mapped = remap.get(entry.categoryId);
      if (mapped) return { ...entry, categoryId: mapped };
      return ids.has(entry.categoryId) ? entry : { ...entry, categoryId: undefined };
    }),
  };
}

function applyPatch(entry: Entry, patch: EntryPatch): Entry {
  const { title, categoryId, remindAt, archivedAt, ...rest } = patch;
  return {
    ...entry,
    ...rest,
    title: title === undefined ? entry.title : title?.trim() || undefined,
    categoryId: categoryId === undefined ? entry.categoryId : categoryId ?? undefined,
    remindAt: remindAt === undefined ? entry.remindAt : remindAt ?? undefined,
    archivedAt: archivedAt === undefined ? entry.archivedAt : archivedAt ?? undefined,
    updatedAt: Date.now(),
  };
}

function reducer(state: EntriesState, action: EntriesAction): EntriesState {
  switch (action.type) {
    case 'hydrate':
      return {
        entries: action.entries,
        categories: action.categories,
        loaded: true,
        entriesPersistenceReady: action.entriesPersistenceReady,
        categoriesPersistenceReady: action.categoriesPersistenceReady,
      };

    case 'add':
      if (state.entries.some((entry) => entry.id === action.entry.id)) return state;
      return {
        ...state,
        entries: [
          action.entry.categoryId &&
          !state.categories.some((category) => category.id === action.entry.categoryId)
            ? { ...action.entry, categoryId: undefined }
            : action.entry,
          ...state.entries,
        ],
      };

    case 'insert': {
      const existing = new Set(state.entries.map((e) => e.id));
      const categoryIds = new Set(state.categories.map((category) => category.id));
      const fresh = action.entries.flatMap((entry) => {
        if (existing.has(entry.id)) return [];
        existing.add(entry.id);
        return [
          entry.categoryId && !categoryIds.has(entry.categoryId)
            ? { ...entry, categoryId: undefined }
            : entry,
        ];
      });
      if (fresh.length === 0) return state;
      return {
        ...state,
        entries: [...fresh, ...state.entries].sort((a, b) => b.createdAt - a.createdAt),
      };
    }

    case 'update': {
      let changed = false;
      const patch =
        typeof action.patch.categoryId === 'string' &&
        !state.categories.some((category) => category.id === action.patch.categoryId)
          ? { ...action.patch, categoryId: null }
          : action.patch;
      const entries = state.entries.map((entry) => {
        if (entry.id !== action.id) return entry;
        changed = true;
        return applyPatch(entry, patch);
      });
      return changed ? { ...state, entries } : state;
    }

    case 'toggleFavorite': {
      const entries = state.entries.map((entry) =>
        entry.id === action.id
          ? { ...entry, isFavorite: !entry.isFavorite, updatedAt: Date.now() }
          : entry,
      );
      return entries.some((entry, index) => entry !== state.entries[index])
        ? { ...state, entries }
        : state;
    }

    case 'addFollowUp': {
      let changed = false;
      const entries = state.entries.map((entry) => {
        if (entry.id !== action.id) return entry;
        changed = true;
        return {
          ...entry,
          followUps: [...(entry.followUps ?? []), action.followUp],
          updatedAt: Date.now(),
        };
      });
      return changed ? { ...state, entries } : state;
    }

    case 'recordView': {
      let changed = false;
      const entries = state.entries.map((entry) => {
        if (entry.id !== action.id) return entry;
        changed = true;
        return { ...entry, timesRediscovered: entry.timesRediscovered + 1, lastViewedAt: Date.now() };
      });
      return changed ? { ...state, entries } : state;
    }

    case 'delete': {
      const entries = state.entries.filter((e) => e.id !== action.id);
      return entries.length === state.entries.length ? state : { ...state, entries };
    }

    case 'clear':
      // "Delete everything" means folders too, otherwise they linger in memory
      // after their storage key has been removed. It is also the explicit
      // recovery path for a corrupt/unreadable record, so future edits may be
      // persisted again after the caller successfully clears storage.
      return {
        ...state,
        entries: [],
        categories: [],
        entriesPersistenceReady: true,
        categoriesPersistenceReady: true,
      };

    case 'addCategories': {
      const ids = new Set(state.categories.map((category) => category.id));
      const names = new Set(state.categories.map((category) => category.name.toLowerCase()));
      const additions = action.categories.filter((category) => {
        const name = category.name.toLowerCase();
        if (ids.has(category.id) || names.has(name)) return false;
        ids.add(category.id);
        names.add(name);
        return true;
      });
      return additions.length > 0
        ? { ...state, categories: [...state.categories, ...additions] }
        : state;
    }

    case 'renameCategory':
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.id ? { ...c, name: action.name } : c)),
      };

    case 'deleteCategory': {
      const now = Date.now();
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        entries: state.entries.map((e) =>
          e.categoryId === action.id ? { ...e, categoryId: undefined, updatedAt: now } : e,
        ),
      };
    }

    default:
      return state;
  }
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface EntriesContextValue {
  entries: Entry[];
  categories: Category[];
  loaded: boolean;
  /** Every tag in use, most-used first. */
  tags: TagCount[];
  addEntry: (input: NewEntryInput) => Entry;
  /** Puts an entry back exactly as it was. Used to undo a delete. */
  restoreEntry: (entry: Entry) => void;
  importEntries: (entries: Entry[]) => number;
  updateEntry: (id: string, patch: EntryPatch) => void;
  deleteEntry: (id: string) => void;
  setStatus: (id: string, status: EntryStatus) => void;
  toggleFavorite: (id: string) => void;
  recordViewed: (id: string) => void;
  addFollowUp: (id: string, text: string) => void;
  clearAll: () => void;
  addCategory: (name: string) => Category;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  restoreBackup: (entries: Entry[], categories: Category[]) => number;
}

const EntriesContext = createContext<EntriesContextValue | null>(null);

export function EntriesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  /**
   * Mutations need to read current state, but taking it from the render
   * closure would give every callback a new identity on each change and
   * re-render every consumer. The ref keeps the callbacks permanently stable.
   */
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadEntries(), loadCategories()]).then(([entriesResult, categoriesResult]) => {
      if (!active) return;
      const entriesPersistenceReady = entriesResult.status === 'fulfilled';
      const categoriesPersistenceReady = categoriesResult.status === 'fulfilled';
      const entries = entriesPersistenceReady ? entriesResult.value : [];
      const categories = categoriesPersistenceReady ? categoriesResult.value : [];

      if (!entriesPersistenceReady && __DEV__) {
        console.warn('[entries] entry hydration failed', entriesResult.reason);
      }
      if (!categoriesPersistenceReady && __DEV__) {
        console.warn('[entries] folder hydration failed', categoriesResult.reason);
      }

      if (entriesPersistenceReady && categoriesPersistenceReady) {
        if (!active) return;
        const reconciled = reconcileLibrary(entries, categories);
        dispatch({
          type: 'hydrate',
          ...reconciled,
          entriesPersistenceReady,
          categoriesPersistenceReady,
        });
        return;
      }

      // Preserve whichever collection was readable. Do not reconcile folder
      // references against an empty fallback when the folder read itself
      // failed, and never persist the fallback for a failed collection.
      dispatch({
        type: 'hydrate',
        entries,
        categories,
        entriesPersistenceReady,
        categoriesPersistenceReady,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist entries and categories independently so touching one does not
  // rewrite the other.
  useEffect(() => {
    if (state.loaded && state.entriesPersistenceReady) {
      void saveEntries(state.entries).catch((error) => {
        if (__DEV__) console.warn('[entries] failed to persist entries', error);
      });
    }
  }, [state.entries, state.loaded, state.entriesPersistenceReady]);

  useEffect(() => {
    if (state.loaded && state.categoriesPersistenceReady) {
      void saveCategories(state.categories).catch((error) => {
        if (__DEV__) console.warn('[entries] failed to persist categories', error);
      });
    }
  }, [state.categories, state.loaded, state.categoriesPersistenceReady]);

  const addEntry = useCallback((input: NewEntryInput): Entry => {
    const text = input.text.trim();
    if (!text) throw new Error('Write something before saving.');
    const now = Date.now();
    const usedIds = new Set(stateRef.current.entries.map((entry) => entry.id));
    let id = generateId();
    while (usedIds.has(id)) id = generateId();
    const entry: Entry = {
      id,
      title: input.title?.trim() || undefined,
      text,
      createdAt: now,
      updatedAt: now,
      status: input.status,
      isFavorite: false,
      tags: normalizedTags(input.tags),
      categoryId: stateRef.current.categories.some((category) => category.id === input.categoryId)
        ? input.categoryId
        : undefined,
      timesRediscovered: 0,
    };
    dispatch({ type: 'add', entry });
    return entry;
  }, []);

  const restoreEntry = useCallback((entry: Entry) => {
    const normalized = normalizeEntry(entry);
    if (!normalized) return;
    if (
      normalized.categoryId &&
      !stateRef.current.categories.some((category) => category.id === normalized.categoryId)
    ) {
      normalized.categoryId = undefined;
    }
    dispatch({ type: 'insert', entries: [normalized] });
  }, []);

  const importEntries = useCallback((incoming: Entry[]): number => {
    const existing = new Set(stateRef.current.entries.map((e) => e.id));
    const categoryIds = new Set(stateRef.current.categories.map((category) => category.id));
    const fresh: Entry[] = [];
    for (const raw of incoming) {
      const entry = normalizeEntry(raw);
      if (!entry || existing.has(entry.id)) continue;
      existing.add(entry.id);
      fresh.push(
        entry.categoryId && !categoryIds.has(entry.categoryId)
          ? { ...entry, categoryId: undefined }
          : entry,
      );
    }
    if (fresh.length > 0) dispatch({ type: 'insert', entries: fresh });
    return fresh.length;
  }, []);

  const updateEntry = useCallback((id: string, patch: EntryPatch) => {
    const next = { ...patch };
    if (next.text !== undefined) {
      next.text = next.text.trim();
      if (!next.text) throw new Error('An entry cannot be empty.');
    }
    if (next.tags !== undefined) next.tags = normalizedTags(next.tags);
    if (
      typeof next.categoryId === 'string' &&
      !stateRef.current.categories.some((category) => category.id === next.categoryId)
    ) {
      next.categoryId = null;
    }
    dispatch({ type: 'update', id, patch: next });
  }, []);

  const deleteEntry = useCallback((id: string) => {
    dispatch({ type: 'delete', id });
  }, []);

  const setStatus = useCallback((id: string, status: EntryStatus) => {
    dispatch({ type: 'update', id, patch: { status } });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    dispatch({ type: 'toggleFavorite', id });
  }, []);

  const recordViewed = useCallback((id: string) => {
    dispatch({ type: 'recordView', id });
  }, []);

  const addFollowUp = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry = stateRef.current.entries.find((e) => e.id === id);
    if (!entry) return;
    const usedIds = new Set((entry.followUps ?? []).map((followUp) => followUp.id));
    let followUpId = generateId();
    while (usedIds.has(followUpId)) followUpId = generateId();
    dispatch({
      type: 'addFollowUp',
      id,
      followUp: { id: followUpId, at: Date.now(), text: trimmed },
    });
  }, []);

  const clearAll = useCallback(() => dispatch({ type: 'clear' }), []);

  const addCategory = useCallback((name: string): Category => {
    const trimmed = categoryName(name);
    const duplicate = stateRef.current.categories.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) throw new Error(`You already have a folder called "${trimmed}".`);
    const usedIds = new Set(stateRef.current.categories.map((category) => category.id));
    let id = generateId();
    while (usedIds.has(id)) id = generateId();
    const category: Category = { id, name: trimmed, createdAt: Date.now() };
    dispatch({ type: 'addCategories', categories: [category] });
    return category;
  }, []);

  const renameCategory = useCallback((id: string, name: string) => {
    const trimmed = categoryName(name);
    if (!stateRef.current.categories.some((category) => category.id === id)) {
      throw new Error('That folder no longer exists.');
    }
    const duplicate = stateRef.current.categories.some(
      (c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) throw new Error(`You already have a folder called "${trimmed}".`);
    dispatch({ type: 'renameCategory', id, name: trimmed });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    dispatch({ type: 'deleteCategory', id });
  }, []);

  /**
   * Merges a backup in. Folders are matched by name so restoring onto a phone
   * that already has "Books" does not end up with two of them, and the entries
   * that referenced the backup's folder id are re-pointed at the local one.
   */
  const restoreBackup = useCallback((backupEntries: Entry[], backupCategories: Category[]): number => {
    const current = stateRef.current;
    const byName = new Map(current.categories.map((c) => [c.name.toLowerCase(), c.id]));
    const usedCategoryIds = new Set(current.categories.map((category) => category.id));
    const remap = new Map<string, string>();
    const additions: Category[] = [];

    for (const raw of backupCategories) {
      const category = normalizeCategory(raw);
      if (!category || remap.has(category.id)) continue;
      const name = category.name;
      const key = name.toLowerCase();
      const localId = byName.get(key);
      if (localId) {
        remap.set(category.id, localId);
      } else {
        let targetId = category.id;
        while (usedCategoryIds.has(targetId)) targetId = generateId();
        usedCategoryIds.add(targetId);
        byName.set(key, targetId);
        remap.set(category.id, targetId);
        additions.push({ id: targetId, name, createdAt: category.createdAt });
      }
    }
    if (additions.length > 0) dispatch({ type: 'addCategories', categories: additions });

    const existingIds = new Set(current.entries.map((e) => e.id));
    const fresh: Entry[] = [];
    for (const raw of backupEntries) {
      const entry = normalizeEntry(raw);
      if (!entry || existingIds.has(entry.id)) continue;
      existingIds.add(entry.id);
      if (entry.categoryId) {
        entry.categoryId = remap.get(entry.categoryId) ??
          (usedCategoryIds.has(entry.categoryId) ? entry.categoryId : undefined);
      }
      fresh.push(entry);
    }

    if (fresh.length > 0) dispatch({ type: 'insert', entries: fresh });
    return fresh.length;
  }, []);

  const tags = useMemo<TagCount[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of state.entries) {
      for (const tag of entry.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [state.entries]);

  const value = useMemo<EntriesContextValue>(
    () => ({
      entries: state.entries,
      categories: state.categories,
      loaded: state.loaded,
      tags,
      addEntry,
      restoreEntry,
      importEntries,
      updateEntry,
      deleteEntry,
      setStatus,
      toggleFavorite,
      recordViewed,
      addFollowUp,
      clearAll,
      addCategory,
      renameCategory,
      deleteCategory,
      restoreBackup,
    }),
    [
      state.entries,
      state.categories,
      state.loaded,
      tags,
      addEntry,
      restoreEntry,
      importEntries,
      updateEntry,
      deleteEntry,
      setStatus,
      toggleFavorite,
      recordViewed,
      addFollowUp,
      clearAll,
      addCategory,
      renameCategory,
      deleteCategory,
      restoreBackup,
    ],
  );

  return <EntriesContext.Provider value={value}>{children}</EntriesContext.Provider>;
}

export function useEntries(): EntriesContextValue {
  const ctx = useContext(EntriesContext);
  if (!ctx) throw new Error('useEntries must be used within an EntriesProvider');
  return ctx;
}
