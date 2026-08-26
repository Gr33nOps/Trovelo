export type EntryStatus = 'new' | 'interesting' | 'done' | 'not_useful';

export const ENTRY_STATUSES: readonly EntryStatus[] = ['new', 'interesting', 'done', 'not_useful'];

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === 'string' && (ENTRY_STATUSES as readonly string[]).includes(value);
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type AppIconMode = 'auto' | 'manual';

/** Which accent hue the user picked. See `ACCENT_COLORS` for what each looks like. */
export type AccentId = 'gold' | 'green' | 'blue' | 'purple' | 'teal' | 'rose';

export const ACCENT_IDS: readonly AccentId[] = ['gold', 'green', 'blue', 'purple', 'teal', 'rose'];

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value);
}

export type SortOrder = 'newest' | 'oldest' | 'rediscovered' | 'forgotten' | 'az';

/** A short, dated thought added to an entry after the fact. */
export interface FollowUp {
  id: string;
  at: number;
  text: string;
}

export interface Entry {
  id: string;
  title?: string;
  text: string;
  createdAt: number;
  updatedAt: number;
  status: EntryStatus;
  isFavorite: boolean;
  tags: string[];
  /** Id of the category (folder) this idea belongs to, if any. */
  categoryId?: string;
  /** How many times this entry has been surfaced by "Surprise Me". */
  timesRediscovered: number;
  /** Epoch ms of the last time the entry was surfaced. */
  lastViewedAt?: number;
  /** Epoch ms after which this entry should be offered again. Cleared once seen. */
  remindAt?: number;
  /** Epoch ms this entry was archived, or undefined if it is active. */
  archivedAt?: number;
  /** Pinned entries sit at the top of the library regardless of sort order. */
  isPinned?: boolean;
  /** Short dated notes added after the original entry, oldest first. */
  followUps?: FollowUp[];
}

export interface Category {
  id: string;
  name: string;
  createdAt: number;
}

export interface NewEntryInput {
  title?: string;
  text: string;
  status: EntryStatus;
  tags: string[];
  categoryId?: string;
}

export interface EntryPatch {
  /** `null` clears the title. */
  title?: string | null;
  text?: string;
  status?: EntryStatus;
  isFavorite?: boolean;
  tags?: string[];
  /** `null` moves the idea out of its folder. */
  categoryId?: string | null;
  timesRediscovered?: number;
  lastViewedAt?: number;
  /** `null` clears the reminder. */
  remindAt?: number | null;
  /** `null` un-archives the entry. */
  archivedAt?: number | null;
  isPinned?: boolean;
  followUps?: FollowUp[];
}

export interface Preferences {
  themeMode: ThemeMode;
  accentId: AccentId;
  streak: number;
  lastOpenDay: string | null;
  /** Longest streak ever reached, so a broken streak still shows progress. */
  bestStreak: number;
  /** Total distinct days the app has been opened. */
  daysOpened: number;
  /** False until the user finishes the welcome screen. */
  onboarded: boolean;
  /** `auto` keeps the home-screen icon matching accent/theme; `manual` respects a picked icon until the user asks to match again. */
  appIconMode: AppIconMode;
}

export type StatusFilter = EntryStatus | 'all' | 'favorites';
