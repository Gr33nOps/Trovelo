import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { DEFAULT_ACCENT_ID } from '../constants/theme';
import { normalizeCategory, normalizeEntry } from '../storage/storage';
import { Category, Entry, Preferences, isAccentId } from '../types';

const BACKUP_APP = 'trovelo';
const INNER_APP = 'trovelo-backup';
/** Backups written before the Trovelo rename, still importable. */
const LEGACY_APP = 'serendipity-box';
const LEGACY_INNER_APP = 'serendipity-box-backup';
/** The very first release wrote a flat `{ marker, entries }` file. */
const LEGACY_MARKER = 'serendipity-box-backup';

/** Current on-disk backup format. */
const BACKUP_VERSION = 2;

/**
 * PBKDF2 cost.
 *
 * OWASP asks for far more, but this runs in JavaScript on a phone, and a value
 * that takes a minute to unlock is a value users disable. 150k with SHA-256
 * keeps unlocking to a few seconds while being ~15x the old setting, and the
 * count is written into the file so it can be raised later without breaking
 * existing backups.
 */
const PBKDF2_ITERATIONS = 150_000;
/** Legacy v1 files used crypto-js defaults: SHA-1, 10k iterations. */
const LEGACY_ITERATIONS = 10_000;

const KEY_BYTES = 32;
const MAC_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 16;

/** Refuse absurd inputs rather than trying to parse them into memory. */
const MAX_BACKUP_BYTES = 32 * 1024 * 1024;

type WordArray = CryptoJS.lib.WordArray;

export interface BackupContents {
  entries: Entry[];
  categories: Category[];
  preferences?: Preferences;
  createdAt?: number;
}

export class LockedBackupError extends Error {
  constructor() {
    super('This backup is locked with a password.');
    this.name = 'LockedBackupError';
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password. Check it and try again.');
    this.name = 'WrongPasswordError';
  }
}

/* ------------------------------------------------------------- primitives -- */

/**
 * crypto-js sources randomness from a `crypto` global. React Native has none,
 * so `WordArray.random` threw and *every* password-protected backup failed.
 * expo-crypto is backed by the platform CSPRNG.
 */
function randomWords(byteCount: number): WordArray {
  const bytes = Crypto.getRandomBytes(byteCount);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      ((bytes[i] ?? 0) << 24) |
        ((bytes[i + 1] ?? 0) << 16) |
        ((bytes[i + 2] ?? 0) << 8) |
        (bytes[i + 3] ?? 0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, byteCount);
}

const b64 = {
  encode: (value: WordArray) => CryptoJS.enc.Base64.stringify(value),
  decode: (value: string) => CryptoJS.enc.Base64.parse(value),
};

/**
 * PBKDF2-HMAC-SHA256, written out from RFC 8018 so the iteration loop can
 * yield to the event loop.
 *
 * crypto-js's own PBKDF2 is a single synchronous burst; at this iteration
 * count it would freeze the UI for seconds with no way to show progress.
 * The HMAC primitive itself is still crypto-js. Only the block/XOR
 * bookkeeping around it lives here.
 */
async function deriveKey(
  password: string,
  salt: WordArray,
  iterations: number,
  byteLength: number,
  onProgress?: (fraction: number) => void,
): Promise<WordArray> {
  const blocks = Math.ceil(byteLength / 32);
  const derived: number[] = [];
  let done = 0;
  const total = blocks * iterations;

  for (let blockIndex = 1; blockIndex <= blocks; blockIndex += 1) {
    const counter = CryptoJS.lib.WordArray.create([blockIndex], 4);
    let u = CryptoJS.HmacSHA256(salt.clone().concat(counter), password);
    const accumulator = u.words.slice();

    for (let i = 1; i < iterations; i += 1) {
      u = CryptoJS.HmacSHA256(u, password);
      for (let w = 0; w < accumulator.length; w += 1) {
        accumulator[w] ^= u.words[w];
      }
      done += 1;
      if (i % 2000 === 0) {
        onProgress?.(done / total);
        // Hand the main thread back so the progress bar can actually paint.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    done += 1;
    derived.push(...accumulator);
  }

  onProgress?.(1);
  return CryptoJS.lib.WordArray.create(derived, byteLength);
}

function splitKey(material: WordArray): { encKey: WordArray; macKey: WordArray } {
  const words = material.words;
  return {
    encKey: CryptoJS.lib.WordArray.create(words.slice(0, KEY_BYTES / 4), KEY_BYTES),
    macKey: CryptoJS.lib.WordArray.create(words.slice(KEY_BYTES / 4, (KEY_BYTES + MAC_BYTES) / 4), MAC_BYTES),
  };
}

/** Constant-time-ish comparison so a bad MAC leaks nothing through timing. */
function macEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function computeMac(macKey: WordArray, version: number, salt: string, iv: string, data: string): string {
  return b64.encode(CryptoJS.HmacSHA256(`${version}|${salt}|${iv}|${data}`, macKey));
}

/* ------------------------------------------------------------ file format -- */

interface BackupFileV2 {
  app: string;
  version: 2;
  createdAt: number;
  protected: boolean;
  kdf?: { algo: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher?: 'AES-256-CBC';
  iv?: string;
  /** HMAC-SHA256 over version|salt|iv|data. */
  mac?: string;
  data: string;
}

function sanitizeInner(raw: unknown): BackupContents {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('That backup could not be read.');
  }
  const obj = raw as Record<string, unknown>;
  if ((obj.app !== INNER_APP && obj.app !== LEGACY_INNER_APP) || !Array.isArray(obj.entries)) {
    throw new Error('That file is not a Trovelo backup.');
  }

  const entries = obj.entries
    .map(normalizeEntry)
    .filter((entry): entry is Entry => entry !== null);

  const categories = Array.isArray(obj.categories)
    ? obj.categories.map(normalizeCategory).filter((c): c is Category => c !== null)
    : [];

  let preferences: Preferences | undefined;
  const p = obj.preferences as Record<string, unknown> | undefined;
  if (p && (p.themeMode === 'system' || p.themeMode === 'light' || p.themeMode === 'dark')) {
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
    preferences = {
      themeMode: p.themeMode,
      accentId: isAccentId(p.accentId) ? p.accentId : DEFAULT_ACCENT_ID,
      streak: num(p.streak),
      lastOpenDay: typeof p.lastOpenDay === 'string' ? p.lastOpenDay : null,
      bestStreak: num(p.bestStreak),
      daysOpened: num(p.daysOpened),
      onboarded: p.onboarded === true,
    };
  }

  return {
    entries,
    categories,
    preferences,
    createdAt: typeof obj.createdAt === 'number' ? obj.createdAt : undefined,
  };
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface CreateBackupOptions {
  password?: string;
  onProgress?: (fraction: number) => void;
}

export async function createBackupFile(
  entries: Entry[],
  categories: Category[],
  preferences: Preferences | undefined,
  options: CreateBackupOptions = {},
): Promise<{ uri: string; fileName: string }> {
  const { password, onProgress } = options;

  const inner: Record<string, unknown> = {
    app: INNER_APP,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    entries,
    categories,
  };
  if (preferences) inner.preferences = preferences;
  const plaintext = JSON.stringify(inner);

  let file: BackupFileV2;
  if (password) {
    const salt = randomWords(SALT_BYTES);
    const iv = randomWords(IV_BYTES);
    const material = await deriveKey(password, salt, PBKDF2_ITERATIONS, KEY_BYTES + MAC_BYTES, onProgress);
    const { encKey, macKey } = splitKey(material);

    const data = CryptoJS.AES.encrypt(plaintext, encKey, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).ciphertext.toString(CryptoJS.enc.Base64);

    const saltB64 = b64.encode(salt);
    const ivB64 = b64.encode(iv);

    file = {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      protected: true,
      kdf: { algo: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: saltB64 },
      cipher: 'AES-256-CBC',
      iv: ivB64,
      // Authenticates the ciphertext: CBC on its own is malleable, and without
      // a MAC a wrong password is only detected by hoping the padding fails.
      mac: computeMac(macKey, BACKUP_VERSION, saltB64, ivB64, data),
      data,
    };
  } else {
    onProgress?.(1);
    file = {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      protected: false,
      data: plaintext,
    };
  }

  const fileName = `trovelo-${formatDate(new Date())}${password ? '-locked' : ''}.json`;
  const uri = `${FileSystem.cacheDirectory ?? ''}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(file));
  return { uri, fileName };
}

/**
 * Removes backup files this app left in the cache.
 *
 * An unencrypted export is a full copy of everything the user has written; it
 * has no business sitting in the cache directory after the share sheet closes.
 */
export async function cleanBackupCache(): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return;
  try {
    const names = await FileSystem.readDirectoryAsync(dir);
    await Promise.all(
      names
        .filter((name) => name.startsWith('trovelo-') || name.startsWith('serendipity-box-') || name.startsWith('serendipity-open-'))
        .map((name) => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(() => {})),
    );
  } catch {
    // Nothing to clean, or the directory is unreadable. Neither is fatal.
  }
}

export interface OpenBackupOptions {
  password?: string;
  onProgress?: (fraction: number) => void;
}

export async function openBackupFile(uri: string, options: OpenBackupOptions = {}): Promise<BackupContents> {
  const { password, onProgress } = options;

  const info = await FileSystem.getInfoAsync(uri);
  const size = (info as { size?: number }).size ?? 0;
  if (size > MAX_BACKUP_BYTES) {
    throw new Error('That file is too large to be a Trovelo backup.');
  }

  let content: string;
  let scratch: string | null = null;
  try {
    content = await FileSystem.readAsStringAsync(uri);
  } catch {
    // Some providers hand back a URI that only `copyAsync` can read.
    scratch = `${FileSystem.cacheDirectory ?? ''}trovelo-open-${Date.now()}.json`;
    await FileSystem.copyAsync({ from: uri, to: scratch });
    content = await FileSystem.readAsStringAsync(scratch);
  }

  try {
    return await parseBackup(content, password, onProgress);
  } finally {
    if (scratch) await FileSystem.deleteAsync(scratch, { idempotent: true }).catch(() => {});
  }
}

async function parseBackup(
  content: string,
  password: string | undefined,
  onProgress?: (fraction: number) => void,
): Promise<BackupContents> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('That file could not be read as a backup.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('That file is not a Trovelo backup.');
  }

  const file = parsed as Record<string, unknown>;

  if (file.app === BACKUP_APP || file.app === LEGACY_APP) {
    if (file.protected !== true) {
      if (typeof file.data !== 'string') throw new Error('That backup is damaged.');
      return sanitizeInner(safeParse(file.data));
    }
    if (!password) throw new LockedBackupError();
    return sanitizeInner(safeParse(await decrypt(file, password, onProgress)));
  }

  // The very first release wrote a flat `{ marker, entries }` file.
  if (file.marker === LEGACY_MARKER && Array.isArray(file.entries)) {
    return sanitizeInner({ app: INNER_APP, entries: file.entries });
  }

  throw new Error('That file is not a Trovelo backup.');
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new WrongPasswordError();
  }
}

async function decrypt(
  file: Record<string, unknown>,
  password: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const data = typeof file.data === 'string' ? file.data : '';
  const ivB64 = typeof file.iv === 'string' ? file.iv : '';
  if (!data || !ivB64) throw new Error('That backup is damaged.');
  const iv = b64.decode(ivB64);

  const version = typeof file.version === 'number' ? file.version : 1;

  if (version >= 2) {
    const kdf = file.kdf as { iterations?: unknown; salt?: unknown } | undefined;
    const saltB64 = typeof kdf?.salt === 'string' ? kdf.salt : '';
    const iterations =
      typeof kdf?.iterations === 'number' && kdf.iterations > 0 && kdf.iterations <= 2_000_000
        ? kdf.iterations
        : PBKDF2_ITERATIONS;
    if (!saltB64) throw new Error('That backup is damaged.');

    const material = await deriveKey(password, b64.decode(saltB64), iterations, KEY_BYTES + MAC_BYTES, onProgress);
    const { encKey, macKey } = splitKey(material);

    const expectedMac = typeof file.mac === 'string' ? file.mac : '';
    if (!expectedMac || !macEquals(expectedMac, computeMac(macKey, version, saltB64, ivB64, data))) {
      // Either the password is wrong or the file was altered. Both mean stop.
      throw new WrongPasswordError();
    }

    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: b64.decode(data) }),
      encKey,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );
    const text = decrypted.toString(CryptoJS.enc.Utf8);
    if (!text) throw new WrongPasswordError();
    return text;
  }

  // v1: crypto-js defaults (SHA-1 PBKDF2, 10k, OpenSSL-serialised ciphertext).
  const saltB64 = typeof file.salt === 'string' ? file.salt : '';
  if (!saltB64) throw new Error('That backup is damaged.');
  onProgress?.(0.5);
  const legacyKey = CryptoJS.PBKDF2(password, b64.decode(saltB64), {
    keySize: KEY_BYTES / 4,
    iterations: LEGACY_ITERATIONS,
  });
  onProgress?.(1);
  const text = CryptoJS.AES.decrypt(data, legacyKey, { iv }).toString(CryptoJS.enc.Utf8);
  if (!text) throw new WrongPasswordError();
  return text;
}

/* --------------------------------------------------------- plain export -- */

/** A human-readable Markdown copy, for keeping notes outside the app. */
export async function createMarkdownExport(
  entries: Entry[],
  categories: Category[],
): Promise<{ uri: string; fileName: string }> {
  const folderName = new Map(categories.map((c) => [c.id, c.name]));
  const lines: string[] = ['# Trovelo', '', `Exported ${new Date().toLocaleDateString()}`, ''];

  for (const entry of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
    lines.push(`## ${entry.title ?? new Date(entry.createdAt).toLocaleDateString()}`);
    const meta = [
      new Date(entry.createdAt).toLocaleDateString(),
      entry.categoryId ? folderName.get(entry.categoryId) : null,
      entry.isFavorite ? 'favourite' : null,
      entry.tags.length ? entry.tags.map((tag) => `#${tag}`).join(' ') : null,
    ].filter(Boolean);
    lines.push(`*${meta.join(' · ')}*`, '', entry.text, '');
  }

  const fileName = `trovelo-${formatDate(new Date())}.md`;
  const uri = `${FileSystem.cacheDirectory ?? ''}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, lines.join('\n'));
  return { uri, fileName };
}
