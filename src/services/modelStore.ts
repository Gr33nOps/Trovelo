import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { AIModelInfo } from '../constants/models';
import { MODEL_DOWNLOAD_KEY } from '../storage/storage';

const MODELS_DIR = `${FileSystem.documentDirectory ?? ''}models/`;

/** First four bytes of every GGUF file, base64-encoded ("GGUF"). */
const GGUF_MAGIC_B64 = 'R0dVRg==';
/** Anything smaller than this cannot be a usable model, usually an error page. */
const MIN_MODEL_BYTES = 20 * 1024 * 1024;

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
  return `${MODELS_DIR}${safeModelFileName(model.fileName)}`;
}

export async function ensureModelsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODELS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
  }
}

/**
 * A real GGUF check rather than a size heuristic.
 *
 * The old test accepted anything at 95% of an expected size, so a download that
 * stalled near the end looked "installed" and then failed at load time with an
 * unexplained native error.
 */
export async function isUsableModel(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return false;
    if (fileSize(info) < MIN_MODEL_BYTES) return false;
    const head = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    return head === GGUF_MAGIC_B64;
  } catch {
    return false;
  }
}

export async function isModelDownloaded(model: AIModelInfo): Promise<boolean> {
  return isUsableModel(getModelPath(model));
}

export async function modelFileSize(path: string): Promise<number> {
  try {
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

async function readSavedResume(modelId: string): Promise<SavedResume | null> {
  try {
    const raw = await AsyncStorage.getItem(MODEL_DOWNLOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedResume;
    return parsed && parsed.modelId === modelId ? parsed : null;
  } catch {
    return null;
  }
}

async function clearSavedResume(): Promise<void> {
  await AsyncStorage.removeItem(MODEL_DOWNLOAD_KEY).catch(() => {});
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

  const run = async (): Promise<string> => {
    await ensureModelsDir();

    const saved = await readSavedResume(model.id);
    const partialInfo = await FileSystem.getInfoAsync(partial);
    const canResume = !!saved?.resumeData && partialInfo.exists && saved.url === model.url;

    const resumable = FileSystem.createDownloadResumable(
      model.url,
      partial,
      {},
      (progress) => {
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
      await clearSavedResume();
      throw new DownloadCancelledError();
    }
    if (stopped === 'pause') throw new DownloadPausedError();

    const result = canResume ? await resumable.resumeAsync() : await resumable.downloadAsync();

    if (stopped === 'pause') {
      // pauseAsync() already wrote the resume token; keep the partial file.
      throw new DownloadPausedError();
    }
    if (stopped === 'cancel') {
      await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
      await clearSavedResume();
      throw new DownloadCancelledError();
    }
    if (!result) throw new Error('The download stopped before it finished.');
    if (result.status !== 200 && result.status !== 206) {
      await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
      await clearSavedResume();
      throw new Error(`The server refused the download (HTTP ${result.status}).`);
    }

    if (!(await isUsableModel(partial))) {
      // A truncated file or an HTML error page saved with a .gguf name.
      await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
      await clearSavedResume();
      throw new Error('The downloaded file is not a valid model. Please try again.');
    }

    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: partial, to: target });
    await clearSavedResume();
    return target;
  };

  return {
    promise: run(),
    pause: () => {
      stopped = 'pause';
      void (async () => {
        try {
          const state = await handle?.pauseAsync();
          if (state?.resumeData) {
            await AsyncStorage.setItem(
              MODEL_DOWNLOAD_KEY,
              JSON.stringify({
                modelId: model.id,
                url: model.url,
                fileUri: partial,
                resumeData: state.resumeData,
              } satisfies SavedResume),
            );
          }
        } catch {
          // Pausing is best-effort; the partial file is what actually matters.
        }
      })();
    },
    cancel: () => {
      stopped = 'cancel';
      void (async () => {
        await handle?.cancelAsync().catch(() => {});
        await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
        await clearSavedResume();
      })();
    },
  };
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

/** How many bytes of a paused/partial download are already on disk. */
export async function partialBytesFor(model: AIModelInfo): Promise<number> {
  return modelFileSize(`${getModelPath(model)}.part`);
}

export async function deleteModelFile(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
  await FileSystem.deleteAsync(`${path}.part`, { idempotent: true }).catch(() => {});
}

export async function listLocalModels(): Promise<LocalModelFile[]> {
  await ensureModelsDir();
  try {
    const names = await FileSystem.readDirectoryAsync(MODELS_DIR);
    const files = await Promise.all(
      names
        .filter((name) => name.toLowerCase().endsWith('.gguf'))
        .map(async (name) => {
          const path = `${MODELS_DIR}${name}`;
          const info = await FileSystem.getInfoAsync(path);
          if (!info.exists || fileSize(info) === 0) return null;
          return { path, fileName: name, sizeBytes: fileSize(info) } satisfies LocalModelFile;
        }),
    );
    return files.filter((file): file is LocalModelFile => file !== null);
  } catch {
    return [];
  }
}

/**
 * Copies a picked GGUF into the app's model directory, never overwriting an
 * existing file and never escaping the directory.
 */
export async function importModelFromFile(uri: string, fileName: string): Promise<string> {
  await ensureModelsDir();
  const name = safeModelFileName(fileName);

  let target = `${MODELS_DIR}${name}`;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let counter = 1; counter < 500; counter += 1) {
    if (!(await FileSystem.getInfoAsync(target)).exists) break;
    target = `${MODELS_DIR}${base}-${counter}${ext}`;
  }

  await FileSystem.copyAsync({ from: uri, to: target });

  if (!(await isUsableModel(target))) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    throw new Error('That file is not a GGUF model the app can run.');
  }
  return target;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
