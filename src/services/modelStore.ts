import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { AIModelInfo } from '../constants/models';
import { MODEL_DOWNLOAD_KEY } from '../storage/storage';

const MODELS_DIR = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}models/` : null;

/** GGUF magic plus the supported little-endian format versions, base64-encoded. */
const GGUF_HEADERS_B64 = new Set(['R0dVRgEAAAA=', 'R0dVRgIAAAA=', 'R0dVRgMAAAA=']);
/** Anything smaller than this cannot be a usable model, usually an error page. */
const MIN_MODEL_BYTES = 20 * 1024 * 1024;
const reservedModelPaths = new Set<string>();
let activeDownloadTarget: string | null = null;
let activeDownload: { target: string; promise: Promise<string>; cancel: () => void } | null = null;
let activeImport: Promise<string> | null = null;

export interface LocalModelFile {
  path: string;
  fileName: string;
  sizeBytes: number;
}

export interface DownloadProgress {
  totalBytes: number;
  receivedBytes: number;
  fraction: number;
}

function fileSize(info: FileSystem.FileInfo): number {
  return (info as { size?: number }).size ?? 0;
}

function modelsDir(): string {
  if (!MODELS_DIR) throw new Error('This device has no writable storage for AI models.');
  return MODELS_DIR;
}

function isManagedFilePath(path: string): boolean {
  const dir = MODELS_DIR;
  if (!dir || !path.startsWith(dir)) return false;
  const relative = path.slice(dir.length);
  return (
    relative.length > 0 &&
    !relative.includes('/') &&
    !relative.includes('\\') &&
    !/[?#]/.test(relative) &&
    !/%(?:2f|5c)/i.test(relative)
  );
}

function assertManagedFilePath(path: string): void {
  if (!isManagedFilePath(path)) throw new Error('That model path is outside the app model directory.');
}

function validateDownloadUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('The model download URL is invalid.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Model downloads must use an HTTPS URL without embedded credentials.');
  }
}

function normalizedHeaders(result: FileSystem.FileSystemDownloadResult): Record<string, string> {
  return Object.fromEntries(
    Object.entries(result.headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function declaredDownloadBytes(result: FileSystem.FileSystemDownloadResult): number | null {
  const headers = normalizedHeaders(result);
  const rangeTotal = headers['content-range']?.match(/\/(\d+)\s*$/)?.[1];
  const raw = rangeTotal ?? (result.status === 200 ? headers['content-length'] : undefined);
  if (!raw) return null;
  const bytes = Number(raw);
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : null;
}

function responseRange(
  result: FileSystem.FileSystemDownloadResult,
): { start: number; end: number; total: number } | null {
  const value = normalizedHeaders(result)['content-range'];
  const match = value?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || total <= end) {
    return null;
  }
  return { start, end, total };
}

/**
 * Keeps a caller-supplied name inside the models directory.
 *
 * File names come from the system document picker, so they are attacker-
 * influenced in the sense that a crafted file can be named `../../foo`. Without
 * this, `${MODELS_DIR}${name}` would happily write outside the directory.
 */
export function safeModelFileName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120)
    .trim();
  return cleaned || `model-${Date.now()}.gguf`;
}

export function getModelPath(model: AIModelInfo): string {
  return `${modelsDir()}${safeModelFileName(model.fileName)}`;
}

export async function ensureModelsDir(): Promise<void> {
  const dir = modelsDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * A real GGUF check rather than a size heuristic.
 *
 * The old test accepted anything at 95% of an expected size, so a download that
 * stalled near the end looked "installed" and then failed at load time with an
 * unexplained native error.
 */
async function modelLooksUsable(path: string): Promise<boolean> {
  if (!isManagedFilePath(path)) return false;
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory) return false;
  if (fileSize(info) < MIN_MODEL_BYTES) return false;
  const head = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: 8,
  });
  return GGUF_HEADERS_B64.has(head);
}

export async function isUsableModel(path: string): Promise<boolean> {
  try {
    return await modelLooksUsable(path);
  } catch {
    return false;
  }
}

export async function isModelDownloaded(model: AIModelInfo): Promise<boolean> {
  return isUsableModel(getModelPath(model));
}

export async function modelFileSize(path: string): Promise<number> {
  try {
    if (!isManagedFilePath(path)) return 0;
    const info = await FileSystem.getInfoAsync(path);
    return info.exists ? fileSize(info) : 0;
  } catch {
    return 0;
  }
}

/** Free space on the device, or null when it cannot be determined. */
export async function freeDiskBytes(): Promise<number | null> {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- downloads -- */

interface SavedResume {
  modelId: string;
  url: string;
  fileUri: string;
  resumeData?: string;
}

interface SavedResumeStore {
  version: 2;
  downloads: Record<string, SavedResume>;
}

async function readResumeStore(): Promise<SavedResumeStore> {
  const raw = await AsyncStorage.getItem(MODEL_DOWNLOAD_KEY);
  if (!raw) return { version: 2, downloads: {} };
  const parsed = JSON.parse(raw) as Partial<SavedResumeStore & SavedResume> | null;
  if (parsed?.version === 2 && parsed.downloads && typeof parsed.downloads === 'object') {
    return { version: 2, downloads: parsed.downloads };
  }
  // Migrate the original single-resume record without throwing away a paused transfer.
  if (typeof parsed?.modelId === 'string') {
    return { version: 2, downloads: { [parsed.modelId]: parsed as SavedResume } };
  }
  return { version: 2, downloads: {} };
}

async function writeResumeStore(store: SavedResumeStore): Promise<void> {
  if (Object.keys(store.downloads).length === 0) await AsyncStorage.removeItem(MODEL_DOWNLOAD_KEY);
  else await AsyncStorage.setItem(MODEL_DOWNLOAD_KEY, JSON.stringify(store));
}

async function saveResume(saved: SavedResume): Promise<void> {
  const store = await readResumeStore();
  store.downloads[saved.modelId] = saved;
  await writeResumeStore(store);
}

async function readSavedResume(model: AIModelInfo, partial: string): Promise<SavedResume | null> {
  try {
    const store = await readResumeStore();
    const parsed = store.downloads[model.id];
    if (!parsed) return null;
    if (
      parsed.url !== model.url ||
      parsed.fileUri !== partial ||
      !isManagedFilePath(parsed.fileUri) ||
      typeof parsed.resumeData !== 'string' ||
      parsed.resumeData.length === 0
    ) {
      delete store.downloads[model.id];
      await writeResumeStore(store).catch(() => {});
      return null;
    }
    return parsed as SavedResume;
  } catch {
    return null;
  }
}

async function clearSavedResume(modelId?: string): Promise<void> {
  if (!modelId) {
    await AsyncStorage.removeItem(MODEL_DOWNLOAD_KEY).catch(() => {});
    return;
  }
  try {
    const store = await readResumeStore();
    if (!store.downloads[modelId]) return;
    delete store.downloads[modelId];
    await writeResumeStore(store);
  } catch {
    await AsyncStorage.removeItem(MODEL_DOWNLOAD_KEY).catch(() => {});
  }
}

async function clearSavedResumeForPartial(partial: string): Promise<void> {
  const store = await readResumeStore();
  for (const [modelId, saved] of Object.entries(store.downloads)) {
    if (saved.fileUri === partial) delete store.downloads[modelId];
  }
  await writeResumeStore(store);
}

async function replaceStagedModel(staged: string, target: string): Promise<void> {
  assertManagedFilePath(staged);
  assertManagedFilePath(target);
  const backup = `${target}.backup`;
  const backupInfo = await FileSystem.getInfoAsync(backup);
  const targetInfo = await FileSystem.getInfoAsync(target);

  // Recover the last good file after a process death between the two moves.
  if (backupInfo.exists) {
    if (targetInfo.exists) await FileSystem.deleteAsync(backup, { idempotent: true });
    else await FileSystem.moveAsync({ from: backup, to: target });
  }

  const current = await FileSystem.getInfoAsync(target);
  if (current.exists) await FileSystem.moveAsync({ from: target, to: backup });
  try {
    await FileSystem.moveAsync({ from: staged, to: target });
  } catch (error) {
    if ((await FileSystem.getInfoAsync(backup)).exists) {
      await FileSystem.moveAsync({ from: backup, to: target }).catch(() => {});
    }
    throw error;
  }
  await FileSystem.deleteAsync(backup, { idempotent: true }).catch(() => {});
}

export interface ModelDownload {
  promise: Promise<string>;
  /** Stops the transfer but keeps the partial file so it can resume. */
  pause: () => void;
  /** Stops the transfer and deletes the partial file. */
  cancel: () => void;
}

/**
 * Downloads a model to `<name>.part` and only moves it into place once the
 * bytes verify. Nothing ever observes a half-written model at its real path.
 *
 * Resuming across app restarts requires the user to have tapped Pause first:
 * that is the only time expo-file-system's `DownloadResumable` populates a
 * usable `resumeData` token (its `savable()` just echoes back whatever
 * `resumeData` was last set to, and nothing sets it except `pauseAsync()`).
 * A call to `savable()` in the middle of an active, un-paused download
 * always reports `resumeData: undefined`. An earlier version of this
 * function persisted that on a timer believing it captured live progress,
 * which silently did nothing. If the app is killed without an explicit
 * pause, the `.part` file survives but the next attempt restarts it from
 * byte zero rather than resuming.
 */
export function downloadModel(
  model: AIModelInfo,
  onProgress: (progress: DownloadProgress) => void,
): ModelDownload {
  const target = getModelPath(model);
  const partial = `${target}.part`;
  let stopped: 'pause' | 'cancel' | null = null;
  let handle: FileSystem.DownloadResumable | null = null;
  let stopOperation: Promise<void> | null = null;
  let committing = false;
  let lockAcquired = false;

  const run = async (): Promise<string> => {
    if (activeDownloadTarget || reservedModelPaths.has(target)) throw new DownloadBusyError();
    activeDownloadTarget = target;
    reservedModelPaths.add(target);
    lockAcquired = true;
    try {
      validateDownloadUrl(model.url);
      await ensureModelsDir();

      const saved = await readSavedResume(model, partial);
      const partialInfo = await FileSystem.getInfoAsync(partial);
      const canResume = !!saved?.resumeData && partialInfo.exists;
      const resumeOffset = canResume ? fileSize(partialInfo) : 0;
      if (!canResume) {
        if (partialInfo.exists) await FileSystem.deleteAsync(partial, { idempotent: true });
        if (saved) await clearSavedResume(model.id);
      }

      const resumable = FileSystem.createDownloadResumable(
        model.url,
        partial,
        {},
        (progress) => {
          if (stopped) return;
          const total = progress.totalBytesExpectedToWrite ?? 0;
          const received = progress.totalBytesWritten ?? 0;
          onProgress({
            totalBytes: total,
            receivedBytes: received,
            fraction: total > 0 ? Math.min(1, received / total) : 0,
          });
        },
        canResume ? saved?.resumeData : undefined,
      );
      handle = resumable;

      // pause()/cancel() may have been called before the handle existed.
      if (stopped === 'cancel') {
        await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
        await clearSavedResume(model.id);
        throw new DownloadCancelledError();
      }
      if (stopped === 'pause') throw new DownloadPausedError();

      let result: FileSystem.FileSystemDownloadResult | undefined;
      try {
        result = (canResume ? await resumable.resumeAsync() : await resumable.downloadAsync()) ?? undefined;
      } catch (error) {
        if (stopOperation) await stopOperation;
        if (stopped === 'pause') throw new DownloadPausedError();
        if (stopped === 'cancel') throw new DownloadCancelledError();
        throw error;
      }

      if (stopOperation) await stopOperation;
      if (stopped === 'pause') throw new DownloadPausedError();
      if (stopped === 'cancel') throw new DownloadCancelledError();
      if (!result) throw new Error('The download stopped before it finished.');
      const expectedStatus = canResume ? 206 : 200;
      if (result.status !== expectedStatus) {
        await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
        await clearSavedResume(model.id);
        throw new Error(
          canResume && result.status === 200
            ? 'The server restarted rather than resumed this model download. Please try again.'
            : `The server returned an unexpected download response (HTTP ${result.status}).`,
        );
      }

      const downloadedInfo = await FileSystem.getInfoAsync(partial);
      const declaredBytes = declaredDownloadBytes(result);
      const range = canResume ? responseRange(result) : null;
      const actualBytes = downloadedInfo.exists ? fileSize(downloadedInfo) : 0;
      const invalidResumeRange =
        canResume &&
        (!range || range.start !== resumeOffset || range.end + 1 !== range.total || range.total !== model.sizeBytes);
      if (
        invalidResumeRange ||
        actualBytes !== model.sizeBytes ||
        (declaredBytes !== null && actualBytes !== declaredBytes)
      ) {
        await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
        await clearSavedResume(model.id);
        throw new Error('The model download was incomplete or changed at its source. Please try again.');
      }

      if (!(await isUsableModel(partial))) {
        await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
        await clearSavedResume(model.id);
        throw new Error('The downloaded file is not a valid supported GGUF model. Please try again.');
      }

      if (stopOperation) await stopOperation;
      if (stopped === 'pause') throw new DownloadPausedError();
      if (stopped === 'cancel') throw new DownloadCancelledError();
      committing = true;
      await replaceStagedModel(partial, target);
      await clearSavedResume(model.id);
      return target;
    } finally {
      if (activeDownloadTarget === target) activeDownloadTarget = null;
      reservedModelPaths.delete(target);
    }
  };

  const pause = () => {
    if (stopped || committing) return;
    stopped = 'pause';
    stopOperation = (async () => {
      try {
        const state = await handle?.pauseAsync();
        if (state?.resumeData) {
          await saveResume({
            modelId: model.id,
            url: model.url,
            fileUri: partial,
            resumeData: state.resumeData,
          });
        }
      } catch {
        // Pausing is best-effort; the partial file is what actually matters.
      }
    })();
  };
  const cancel = () => {
    if (stopped === 'cancel' || committing) return;
    const previousStopOperation = stopOperation;
    stopped = 'cancel';
    stopOperation = (async () => {
      if (previousStopOperation) await previousStopOperation;
      await handle?.cancelAsync().catch(() => {});
      await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
      await clearSavedResume(model.id);
    })();
  };
  const promise = run();
  const tracked = { target, promise, cancel };
  if (lockAcquired) {
    activeDownload = tracked;
    void promise
      .finally(() => {
        if (activeDownload === tracked) activeDownload = null;
      })
      .catch(() => {});
  }
  return { promise, pause, cancel };
}

export class DownloadPausedError extends Error {
  constructor() {
    super('Download paused.');
    this.name = 'DownloadPausedError';
  }
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled.');
    this.name = 'DownloadCancelledError';
  }
}

export class DownloadBusyError extends Error {
  constructor() {
    super('Another model download is already active.');
    this.name = 'DownloadBusyError';
  }
}

/** How many bytes of a paused/partial download are already on disk. */
export async function partialBytesFor(model: AIModelInfo): Promise<number> {
  const partial = `${getModelPath(model)}.part`;
  return (await readSavedResume(model, partial)) ? modelFileSize(partial) : 0;
}

export async function deleteModelFile(path: string): Promise<void> {
  assertManagedFilePath(path);
  if (!path.toLowerCase().endsWith('.gguf')) throw new Error('Only installed GGUF models can be removed.');
  if (reservedModelPaths.has(path)) throw new DownloadBusyError();
  await FileSystem.deleteAsync(path, { idempotent: true });
  await FileSystem.deleteAsync(`${path}.part`, { idempotent: true });
  await FileSystem.deleteAsync(`${path}.backup`, { idempotent: true });
  await clearSavedResumeForPartial(`${path}.part`);
}

export async function listLocalModels(): Promise<LocalModelFile[]> {
  await ensureModelsDir();
  const dir = modelsDir();
  const names = await FileSystem.readDirectoryAsync(dir);
  const files = await Promise.all(
    names
      .filter((name) => name.toLowerCase().endsWith('.gguf'))
      .map(async (name) => {
        const path = `${dir}${name}`;
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists || !(await modelLooksUsable(path))) return null;
        return { path, fileName: name, sizeBytes: fileSize(info) } satisfies LocalModelFile;
      }),
  );
  return files.filter((file): file is LocalModelFile => file !== null);
}

/**
 * Copies a picked GGUF into the app's model directory, never overwriting an
 * existing file and never escaping the directory.
 */
export async function importModelFromFile(uri: string, fileName: string): Promise<string> {
  if (activeImport) throw new DownloadBusyError();
  const operation = importModelFromFileUnlocked(uri, fileName);
  activeImport = operation;
  try {
    return await operation;
  } finally {
    if (activeImport === operation) activeImport = null;
  }
}

async function importModelFromFileUnlocked(uri: string, fileName: string): Promise<string> {
  if (!/^(?:content|file):\/\//i.test(uri)) {
    throw new Error('Choose a model file stored on this device.');
  }
  await ensureModelsDir();
  const safeName = safeModelFileName(fileName);
  const name = safeName.toLowerCase().endsWith('.gguf') ? safeName : `${safeName}.gguf`;
  const dir = modelsDir();
  const temporary = `${dir}.import-${Date.now()}-${Math.random().toString(36).slice(2)}.part`;

  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let target = `${dir}${name}`;
  let foundTarget = false;
  for (let counter = 0; counter < 500; counter += 1) {
    target = counter === 0 ? `${dir}${name}` : `${dir}${base}-${counter}${ext}`;
    if (!reservedModelPaths.has(target) && !(await FileSystem.getInfoAsync(target)).exists) {
      reservedModelPaths.add(target);
      foundTarget = true;
      break;
    }
  }
  if (!foundTarget) throw new Error('Too many models have the same file name. Rename the file and try again.');

  try {
    await FileSystem.copyAsync({ from: uri, to: temporary });
    if (!(await isUsableModel(temporary))) {
      throw new Error('That file is not a supported GGUF model the app can run.');
    }
    await FileSystem.moveAsync({ from: temporary, to: target });
    return target;
  } finally {
    reservedModelPaths.delete(target);
    await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
  }
}

/**
 * Cancels/awaits model file activity, then removes every managed model and
 * partial artifact. The caller must unload the in-memory llama context first.
 */
export async function removeAllModelFiles(): Promise<void> {
  const download = activeDownload;
  if (download) {
    download.cancel();
    await download.promise.catch(() => {});
    if (activeDownload === download) activeDownload = null;
  }
  const importing = activeImport;
  if (importing) {
    await importing.catch(() => {});
    if (activeImport === importing) activeImport = null;
  }

  if (activeDownload || activeImport || activeDownloadTarget) {
    throw new DownloadBusyError();
  }
  if (MODELS_DIR) await FileSystem.deleteAsync(MODELS_DIR, { idempotent: true });
  await AsyncStorage.removeItem(MODEL_DOWNLOAD_KEY);
  reservedModelPaths.clear();
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
