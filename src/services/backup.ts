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
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 600_000;
/** Legacy v1 files used PBKDF2-HMAC-SHA1 with 10k iterations. */
const LEGACY_ITERATIONS = 10_000;
const MAX_PASSWORD_LENGTH = 1024;

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

export class DamagedBackupError extends Error {
  constructor(message = 'That backup is damaged.') {
    super(message);
    this.name = 'DamagedBackupError';
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

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function decodeBase64(value: string, expectedBytes?: number): WordArray {
  if (!value || value.length % 4 !== 0 || !BASE64.test(value)) throw new DamagedBackupError();
  const decoded = b64.decode(value);
  if (expectedBytes !== undefined && decoded.sigBytes !== expectedBytes) throw new DamagedBackupError();
  return decoded;
}

function cachePath(fileName: string): string {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('This device has no writable cache for this file operation.');
  return `${dir}${fileName}`;
}

function serializedBytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    // A supplementary-plane code point spans a surrogate pair (two UTF-16
    // units); codePointAt combines the pair for us, so skip the low
    // surrogate we've already accounted for.
    const code = value.codePointAt(index)!;
    if (code > 0xffff) index += 1;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
    if (bytes > MAX_BACKUP_BYTES) return bytes;
  }
  return bytes;
}

function assertBackupSize(size: number): void {
  if (!Number.isFinite(size) || size < 0 || size > MAX_BACKUP_BYTES) {
    throw new Error('That file is too large to be a Trovelo backup.');
  }
}

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

function validateBackupShape(obj: Record<string, unknown>): void {
  if (obj.app !== INNER_APP && obj.app !== LEGACY_INNER_APP) {
    throw new Error('That file is not a Trovelo backup.');
  }
  if (obj.app === INNER_APP && obj.version !== BACKUP_VERSION) {
    if (typeof obj.version === 'number' && obj.version > BACKUP_VERSION) {
      throw new Error('This backup was made by a newer version of Trovelo. Update the app and try again.');
    }
    throw new DamagedBackupError('This backup format is not supported by this version of Trovelo.');
  }
  if (
    obj.app === LEGACY_INNER_APP &&
    obj.version !== undefined &&
    (typeof obj.version !== 'number' || obj.version < 1 || obj.version > BACKUP_VERSION)
  ) {
    throw new Error('This backup format is not supported by this version of Trovelo.');
  }
  if (!Array.isArray(obj.entries)) throw new DamagedBackupError();
  if (obj.app === INNER_APP && !Array.isArray(obj.categories)) throw new DamagedBackupError();
  if (obj.app === INNER_APP && (typeof obj.createdAt !== 'number' || !Number.isFinite(obj.createdAt))) {
    throw new DamagedBackupError();
  }
}

function sanitizeEntries(rawEntries: unknown[]): Entry[] {
  const entryIds = new Set<string>();
  const entries: Entry[] = [];
  for (const rawEntry of rawEntries) {
    const entry = normalizeEntry(rawEntry);
    if (!entry || entryIds.has(entry.id)) continue;
    entryIds.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

function sanitizeCategories(rawCategories: unknown): Category[] {
  const categoryIds = new Set<string>();
  const categories: Category[] = [];
  if (Array.isArray(rawCategories)) {
    for (const rawCategory of rawCategories) {
      const category = normalizeCategory(rawCategory);
      if (!category || categoryIds.has(category.id)) continue;
      categoryIds.add(category.id);
      categories.push(category);
    }
  }
  return categories;
}

function sanitizePreferences(raw: unknown): Preferences | undefined {
  const p = raw as Record<string, unknown> | undefined;
  if (!p || (p.themeMode !== 'system' && p.themeMode !== 'light' && p.themeMode !== 'dark')) return undefined;
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const streak = num(p.streak);
  return {
    themeMode: p.themeMode,
    accentId: isAccentId(p.accentId) ? p.accentId : DEFAULT_ACCENT_ID,
    streak,
    lastOpenDay: typeof p.lastOpenDay === 'string' ? p.lastOpenDay : null,
    bestStreak: Math.max(streak, num(p.bestStreak)),
    daysOpened: num(p.daysOpened),
    onboarded: p.onboarded === true,
  };
}

function sanitizeInner(raw: unknown): BackupContents {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('That backup could not be read.');
  }
  const obj = raw as Record<string, unknown>;
  validateBackupShape(obj);

  return {
    entries: sanitizeEntries(obj.entries as unknown[]),
    categories: sanitizeCategories(obj.categories),
    preferences: sanitizePreferences(obj.preferences),
    createdAt:
      typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : undefined,
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
  if (password && password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('That backup password is too long.');
  }

  const inner: Record<string, unknown> = {
    app: INNER_APP,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    entries,
    categories,
  };
  if (preferences) inner.preferences = preferences;
  const plaintext = JSON.stringify(inner);
  assertBackupSize(serializedBytes(plaintext));

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
  const uri = cachePath(fileName);
  const serialized = JSON.stringify(file);
  assertBackupSize(serializedBytes(serialized));
  await FileSystem.writeAsStringAsync(uri, serialized);
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
  const names = await FileSystem.readDirectoryAsync(dir);
  await Promise.all(
    names
      .filter((name) => name.startsWith('trovelo-') || name.startsWith('serendipity-box-') || name.startsWith('serendipity-open-'))
      .map((name) => FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true })),
  );
}

export interface OpenBackupOptions {
  password?: string;
  onProgress?: (fraction: number) => void;
}

async function knownFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    if (info.isDirectory) throw new DamagedBackupError('Choose a backup file, not a folder.');
    const size = (info as { size?: unknown }).size;
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null;
  } catch (error) {
    if (error instanceof DamagedBackupError) throw error;
    return null;
  }
}

async function readBackupContent(
  uri: string,
  originalSize: number | null,
  copyToCheckedScratch: () => Promise<string>,
): Promise<string> {
  // A content provider may not expose metadata. Copying first gives us a
  // real file whose size can be enforced before any JSON reaches memory.
  let source = originalSize === null || uri.startsWith('content:') ? await copyToCheckedScratch() : uri;
  try {
    return await FileSystem.readAsStringAsync(source);
  } catch {
    if (source !== uri) throw new DamagedBackupError('That backup could not be read.');
    source = await copyToCheckedScratch();
    return await FileSystem.readAsStringAsync(source);
  }
}

export async function openBackupFile(uri: string, options: OpenBackupOptions = {}): Promise<BackupContents> {
  const { password, onProgress } = options;
  if (password && password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('That backup password is too long.');
  }

  let scratch: string | null = null;
  const copyToCheckedScratch = async (): Promise<string> => {
    if (scratch) return scratch;
    scratch = cachePath(`trovelo-open-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.json`);
    try {
      await FileSystem.copyAsync({ from: uri, to: scratch });
    } catch {
      throw new DamagedBackupError('That backup could not be read.');
    }
    const copiedSize = await knownFileSize(scratch);
    if (copiedSize === null) throw new DamagedBackupError('That backup could not be read.');
    assertBackupSize(copiedSize);
    return scratch;
  };

  try {
    const originalSize = await knownFileSize(uri);
    if (originalSize !== null) assertBackupSize(originalSize);
    const content = await readBackupContent(uri, originalSize, copyToCheckedScratch);
    // Also protect platforms that report an inaccurate file size.
    assertBackupSize(serializedBytes(content));
    return await parseBackup(content, password, onProgress);
  } finally {
    if (scratch) await FileSystem.deleteAsync(scratch, { idempotent: true }).catch(() => {});
  }
}

/** A pre-rename file with no `version` field at all is implicitly v1. */
function resolveBackupVersion(file: Record<string, unknown>): number | null {
  if (file.app === LEGACY_APP && file.version === undefined) return 1;
  if (typeof file.version === 'number' && Number.isInteger(file.version)) return file.version;
  return null;
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
    const version = resolveBackupVersion(file);
    if (
      version === null ||
      version < 1 ||
      version > BACKUP_VERSION ||
      (file.app === BACKUP_APP && version !== BACKUP_VERSION)
    ) {
      throw new Error('This backup format is not supported by this version of Trovelo.');
    }
    const protectedFlag =
      file.app === LEGACY_APP && file.protected === undefined ? false : file.protected;
    if (typeof protectedFlag !== 'boolean') throw new DamagedBackupError();
    if (typeof file.data !== 'string' || !file.data) throw new DamagedBackupError();

    if (!protectedFlag) return sanitizeInner(parsePlainJson(file.data));
    if (!password) throw new LockedBackupError();
    const plaintext = await decrypt(file, version, password, onProgress);
    return sanitizeInner(version === 1 ? parseLegacyDecryptedJson(plaintext) : parsePlainJson(plaintext));
  }

  // The very first release wrote a flat `{ marker, entries }` file.
  if (file.marker === LEGACY_MARKER && Array.isArray(file.entries)) {
    return sanitizeInner({ app: LEGACY_INNER_APP, entries: file.entries });
  }

  throw new Error('That file is not a Trovelo backup.');
}

function parsePlainJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new DamagedBackupError();
  }
}

function parseLegacyDecryptedJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    // V1 had no MAC, so invalid plaintext is the only reliable indication that
    // the supplied password did not derive the right key.
    throw new WrongPasswordError();
  }
}

async function decryptV2(
  file: Record<string, unknown>,
  version: number,
  data: string,
  ivB64: string,
  password: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (file.cipher !== 'AES-256-CBC') throw new DamagedBackupError();
  if (typeof file.kdf !== 'object' || file.kdf === null || Array.isArray(file.kdf)) {
    throw new DamagedBackupError();
  }
  const kdf = file.kdf as { algo?: unknown; iterations?: unknown; salt?: unknown };
  if (kdf.algo !== 'PBKDF2-SHA256') throw new DamagedBackupError();
  const saltB64 = typeof kdf?.salt === 'string' ? kdf.salt : '';
  const iterations = kdf.iterations;
  if (
    typeof iterations !== 'number' ||
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new DamagedBackupError();
  }

  const salt = decodeBase64(saltB64, SALT_BYTES);
  const iv = decodeBase64(ivB64, IV_BYTES);
  const ciphertext = decodeBase64(data);
  if (ciphertext.sigBytes === 0 || ciphertext.sigBytes % IV_BYTES !== 0) {
    throw new DamagedBackupError();
  }
  const expectedMac = typeof file.mac === 'string' ? file.mac : '';
  decodeBase64(expectedMac, MAC_BYTES);

  const material = await deriveKey(password, salt, iterations, KEY_BYTES + MAC_BYTES, onProgress);
  const { encKey, macKey } = splitKey(material);

  if (!expectedMac || !macEquals(expectedMac, computeMac(macKey, version, saltB64, ivB64, data))) {
    // Either the password is wrong or the file was altered. Both mean stop.
    throw new WrongPasswordError();
  }

  let text: string;
  try {
    const decrypted = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext }),
      encKey,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 },
    );
    text = decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    throw new DamagedBackupError();
  }
  if (!text) throw new DamagedBackupError();
  return text;
}

async function decryptV1(
  file: Record<string, unknown>,
  data: string,
  ivB64: string,
  password: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  // v1: PBKDF2-HMAC-SHA1, 10k iterations, OpenSSL-serialised ciphertext.
  const saltB64 = typeof file.salt === 'string' ? file.salt : '';
  if (!saltB64) throw new DamagedBackupError();
  const salt = decodeBase64(saltB64, SALT_BYTES);
  const iv = decodeBase64(ivB64, IV_BYTES);
  onProgress?.(0.5);
  const legacyKey = CryptoJS.PBKDF2(password, salt, {
    keySize: KEY_BYTES / 4,
    iterations: LEGACY_ITERATIONS,
    hasher: CryptoJS.algo.SHA1,
  });
  onProgress?.(1);
  let text: string;
  try {
    text = CryptoJS.AES.decrypt(data, legacyKey, { iv }).toString(CryptoJS.enc.Utf8);
  } catch {
    throw new WrongPasswordError();
  }
  if (!text) throw new WrongPasswordError();
  return text;
}

async function decrypt(
  file: Record<string, unknown>,
  version: number,
  password: string,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const data = typeof file.data === 'string' ? file.data : '';
  const ivB64 = typeof file.iv === 'string' ? file.iv : '';
  if (!data || !ivB64) throw new DamagedBackupError();

  if (version === 2) return decryptV2(file, version, data, ivB64, password, onProgress);
  return decryptV1(file, data, ivB64, password, onProgress);
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
  const uri = cachePath(fileName);
  await FileSystem.writeAsStringAsync(uri, lines.join('\n'));
  return { uri, fileName };
}
