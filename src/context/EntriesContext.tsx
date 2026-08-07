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
  saveCategories,
  saveEntries,
} from '../storage/storage';
import { Category, Entry, EntryPatch, EntryStatus, FollowUp, NewEntryInput } from '../types';
import { generateId } from '../utils/id';
import { normalizeTag } from '../utils/tags';

interface EntriesState {
  entries: Entry[];
  categories: Category[];
  loaded: boolean;
}

type EntriesAction =
  | { type: 'hydrate'; entries: Entry[]; categories: Category[] }
  | { type: 'add'; entry: Entry }
  | { type: 'insert'; entries: Entry[] }
  | { type: 'update'; id: string; patch: EntryPatch }
  /** Distinct from 'update': records a Surprise Me / Review reveal without
   *  touching `updatedAt`, so looking at something does not read as editing it. */
  | { type: 'recordView'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'clear' }
  | { type: 'addCategories'; categories: Category[] }
  | { type: 'renameCategory'; id: string; name: string }
  | { type: 'deleteCategory'; id: string };

const INITIAL: EntriesState = { entries: [], categories: [], loaded: false };

function applyPatch(entry: Entry, patch: EntryPatch): Entry {
  const { title, categoryId, dueAt, remindAt, archivedAt, ...rest } = patch;
  return {
    ...entry,
    ...rest,
    title: title === undefined ? entry.title : title?.trim() || undefined,
    categoryId: categoryId === undefined ? entry.categoryId : categoryId ?? undefined,
    dueAt: dueAt === undefined ? entry.dueAt : dueAt ?? undefined,
    remindAt: remindAt === undefined ? entry.remindAt : remindAt ?? undefined,
    archivedAt: archivedAt === undefined ? entry.archivedAt : archivedAt ?? undefined,
    updatedAt: Date.now(),
  };
}

function reducer(state: EntriesState, action: EntriesAction): EntriesState {
  switch (action.type) {
    case 'hydrate':
      return { entries: action.entries, categories: action.categories, loaded: true };

    case 'add':
      return { ...state, entries: [action.entry, ...state.entries] };

    case 'insert': {
      const existing = new Set(state.entries.map((e) => e.id));
      const fresh = action.entries.filter((e) => !existing.has(e.id));
      if (fresh.length === 0) return state;
      return {
        ...state,
        entries: [...fresh, ...state.entries].sort((a, b) => b.createdAt - a.createdAt),
      };
    }

    case 'update': {
      let changed = false;
      const entries = state.entries.map((entry) => {
        if (entry.id !== action.id) return entry;
        changed = true;
        return applyPatch(entry, action.patch);
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
      // after their storage key has been removed.
      return state.entries.length === 0 && state.categories.length === 0
        ? state
        : { ...state, entries: [], categories: [] };

    case 'addCategories': {
      if (action.categories.length === 0) return state;
      return { ...state, categories: [...state.categories, ...action.categories] };
    }

    case 'renameCategory':
      return {
        ...state,
        categories: state.categories.map((c) => (c.id === action.id ? { ...c, name: action.name } : c)),
      };

    case 'deleteCategory':
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        entries: state.entries.map((e) =>
          e.categoryId === action.id ? { ...e, categoryId: undefined } : e,
        ),
      };

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
    Promise.all([loadEntries(), loadCategories()])
      .then(([entries, categories]) => {
        if (active) dispatch({ type: 'hydrate', entries, categories });
      })
      .catch(() => {
        if (active) dispatch({ type: 'hydrate', entries: [], categories: [] });
      });
    return () => {
      active = false;
    };
  }, []);

  // Persist entries and categories independently so touching one does not
  // rewrite the other.
  useEffect(() => {
    if (state.loaded) void saveEntries(state.entries);
  }, [state.entries, state.loaded]);

  useEffect(() => {
    if (state.loaded) void saveCategories(state.categories);
  }, [state.categories, state.loaded]);

  const addEntry = useCallback((input: NewEntryInput): Entry => {
    const now = Date.now();
    const entry: Entry = {
      id: generateId(),
      title: input.title?.trim() || undefined,
      text: input.text.trim(),
      createdAt: now,
      updatedAt: now,
      status: input.status,
      isFavorite: false,
      tags: Array.from(new Set(input.tags.map(normalizeTag).filter(Boolean))),
      categoryId: input.categoryId,
      timesRediscovered: 0,
      kind: input.kind && input.kind !== 'idea' ? input.kind : undefined,
      dueAt: input.dueAt,
    };
    dispatch({ type: 'add', entry });
    return entry;
  }, []);

  const restoreEntry = useCallback((entry: Entry) => {
    dispatch({ type: 'insert', entries: [entry] });
  }, []);

  const importEntries = useCallback((incoming: Entry[]): number => {
    const existing = new Set(stateRef.current.entries.map((e) => e.id));
    const fresh = incoming.filter((e) => !existing.has(e.id));
    if (fresh.length > 0) dispatch({ type: 'insert', entries: fresh });
    return fresh.length;
  }, []);

  const updateEntry = useCallback((id: string, patch: EntryPatch) => {
    dispatch({ type: 'update', id, patch });
  }, []);

  const deleteEntry = useCallback((id: string) => {
    dispatch({ type: 'delete', id });
  }, []);

  const setStatus = useCallback((id: string, status: EntryStatus) => {
    dispatch({ type: 'update', id, patch: { status } });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const entry = stateRef.current.entries.find((e) => e.id === id);
    if (entry) dispatch({ type: 'update', id, patch: { isFavorite: !entry.isFavorite } });
  }, []);

  const recordViewed = useCallback((id: string) => {
    dispatch({ type: 'recordView', id });
  }, []);

  const addFollowUp = useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry = stateRef.current.entries.find((e) => e.id === id);
    if (!entry) return;
    const followUp: FollowUp = { id: generateId(), at: Date.now(), text: trimmed };
    dispatch({ type: 'update', id, patch: { followUps: [...(entry.followUps ?? []), followUp] } });
  }, []);

  const clearAll = useCallback(() => dispatch({ type: 'clear' }), []);

  const addCategory = useCallback((name: string): Category => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the folder a name.');
    if (trimmed.length > 40) throw new Error('That folder name is too long.');
    const duplicate = stateRef.current.categories.some(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) throw new Error(`You already have a folder called "${trimmed}".`);
    const category: Category = { id: generateId(), name: trimmed, createdAt: Date.now() };
    dispatch({ type: 'addCategories', categories: [category] });
    return category;
  }, []);

  const renameCategory = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Give the folder a name.');
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
    const remap = new Map<string, string>();
    const additions: Category[] = [];

    for (const category of backupCategories) {
      const name = category.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const localId = byName.get(key);
      if (localId) {
        remap.set(category.id, localId);
      } else {
        byName.set(key, category.id);
        additions.push({ id: category.id, name, createdAt: category.createdAt });
      }
    }
    if (additions.length > 0) dispatch({ type: 'addCategories', categories: additions });

    const existingIds = new Set(current.entries.map((e) => e.id));
    const fresh = backupEntries
      .filter((entry) => !existingIds.has(entry.id))
      .map((entry) =>
        entry.categoryId && remap.has(entry.categoryId)
          ? { ...entry, categoryId: remap.get(entry.categoryId) }
          : entry,
      );

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
