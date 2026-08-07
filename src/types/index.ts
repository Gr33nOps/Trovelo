export type EntryStatus = 'new' | 'interesting' | 'done' | 'not_useful';

export const ENTRY_STATUSES: readonly EntryStatus[] = ['new', 'interesting', 'done', 'not_useful'];

export function isEntryStatus(value: unknown): value is EntryStatus {
  return typeof value === 'string' && (ENTRY_STATUSES as readonly string[]).includes(value);
}

/**
 * What kind of thing an entry is. Missing (`undefined`) means 'idea', which is
 * both the original and the most common case, so every entry saved before
 * this field existed is still valid without a migration.
 */
export type EntryKind = 'idea' | 'note' | 'task' | 'journal';

export const ENTRY_KINDS: readonly EntryKind[] = ['idea', 'note', 'task', 'journal'];

export function isEntryKind(value: unknown): value is EntryKind {
  return typeof value === 'string' && (ENTRY_KINDS as readonly string[]).includes(value);
}

export type ThemeMode = 'system' | 'light' | 'dark';

/** Which accent hue the user picked. See `ACCENT_COLORS` for what each looks like. */
export type AccentId = 'gold' | 'green' | 'blue' | 'purple' | 'teal' | 'rose';

export const ACCENT_IDS: readonly AccentId[] = ['gold', 'green', 'blue', 'purple', 'teal', 'rose'];

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value);
}

export type SortOrder = 'newest' | 'oldest' | 'rediscovered' | 'forgotten' | 'az';

/** Which dictation engine turns speech into text. */
export type VoiceProvider = 'vosk' | 'android';

export const VOICE_PROVIDERS: readonly VoiceProvider[] = ['vosk', 'android'];

export function isVoiceProvider(value: unknown): value is VoiceProvider {
  return typeof value === 'string' && (VOICE_PROVIDERS as readonly string[]).includes(value);
}

/** Which preset filled in a remote AI provider's fields. `baseUrl`/`model` stay authoritative either way. */
export type AiProviderPreset = 'groq' | 'openrouter' | 'gemini' | 'custom';

export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = ['groq', 'openrouter', 'gemini', 'custom'];

export function isAiProviderPreset(value: unknown): value is AiProviderPreset {
  return typeof value === 'string' && (AI_PROVIDER_PRESETS as readonly string[]).includes(value);
}

/**
 * A user-configured OpenAI-compatible endpoint. The API key is deliberately
 * not part of this shape: it lives in secure storage, never in the same
 * AsyncStorage record as everything else, and never in a backup file.
 */
export interface RemoteAiConfig {
  preset: AiProviderPreset;
  label: string;
  baseUrl: string;
  model: string;
}

/** Which engine the assistant tasks actually run on when the assistant is turned on. */
export type AiEngineKind = 'local' | 'remote';

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
  /** Undefined means 'idea'. */
  kind?: EntryKind;
  /** Epoch ms a task is due. Only meaningful when kind is 'task'. */
  dueAt?: number;
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
  kind?: EntryKind;
  dueAt?: number;
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
  kind?: EntryKind;
  /** `null` clears the due date. */
  dueAt?: number | null;
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
}

export type StatusFilter = EntryStatus | 'all' | 'favorites';
