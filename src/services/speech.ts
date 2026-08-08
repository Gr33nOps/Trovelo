import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const { VoskSpeech } = NativeModules;

// Tried the "lgraph" model (128 MB) for better accuracy, but it builds its
// decoding graph dynamically instead of using a precompiled one, which is
// noticeably heavier per frame of audio to decode. On a phone CPU that meant
// dictation could not keep up with real-time speech: it looked hung, not
// slow. "small" is the model Vosk itself builds and ships for real-time use
// on Android/RPi-class hardware, which is what this needs more than a small
// accuracy gain that is not usable in practice.
export const SPEECH_MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip';
export const SPEECH_MODEL_FILE_NAME = 'vosk-model-small-en-us-0.15.zip';
export const SPEECH_MODEL_SIZE_LABEL = '41 MB';
/** Exact size published by the pinned versioned archive. */
export const SPEECH_MODEL_SIZE_BYTES = 41_205_931;

export const SPEECH_EVENTS = {
  partial: 'VoskSpeechPartial',
  result: 'VoskSpeechResult',
  final: 'VoskSpeechFinal',
  error: 'VoskSpeechError',
} as const;

/** Voice input is an Android-only native module today. */
export const speechAvailable: boolean = VoskSpeech != null && Platform.OS === 'android';

export const speechEvents = speechAvailable ? new NativeEventEmitter(VoskSpeech) : null;

function zipPath(): string {
  const dir = FileSystem.documentDirectory;
  if (!dir) throw new Error('This device has no writable storage for the speech pack.');
  return `${dir}${SPEECH_MODEL_FILE_NAME}`;
}

export interface SpeechResult {
  partial?: string;
  text?: string;
}

export function parseSpeechResult(json: string): SpeechResult {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        partial: typeof parsed.partial === 'string' ? parsed.partial : undefined,
        text: typeof parsed.text === 'string' ? parsed.text : undefined,
      };
    }
  } catch {
    // Vosk occasionally emits a bare error string; treat it as empty.
  }
  return {};
}

/**
 * True only when the *currently shipped* model is installed. The native side
 * checks the installed model against `SPEECH_MODEL_FILE_NAME`, so a phone
 * that installed a different speech pack under an earlier build (this one
 * briefly shipped the larger "lgraph" model, which turned out too slow to
 * decode in real time on a phone) reports not-ready and is sent back through
 * the download flow, instead of silently carrying on with the wrong model.
 */
export async function isSpeechModelReady(): Promise<boolean> {
  if (!speechAvailable) return false;
  try {
    return (await VoskSpeech.isModelReady(SPEECH_MODEL_FILE_NAME)) === true;
  } catch {
    return false;
  }
}

export async function initializeSpeech(): Promise<void> {
  if (!speechAvailable) {
    throw new Error('Voice input is not available on this device.');
  }
  await VoskSpeech.initialize();
}

export interface SpeechDownloadHandle {
  cancel: () => void;
}

interface ActiveSpeechDownload {
  cancelled: boolean;
  installing: boolean;
  nativeHandle: FileSystem.DownloadResumable | null;
  done: Promise<void>;
  cancel: () => void;
}

let activeSpeechDownload: ActiveSpeechDownload | null = null;

async function isUsableSpeechArchive(path: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    const size = info.exists && !info.isDirectory ? ((info as { size?: number }).size ?? 0) : 0;
    if (size !== SPEECH_MODEL_SIZE_BYTES) return false;
    const header = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    return header === 'UEsDBA==';
  } catch {
    return false;
  }
}

/**
 * Downloads and unpacks the offline speech pack.
 *
 * The zip is deleted as soon as the native side has unpacked it. There is no
 * reason to leave 41 MB of duplicate data in the documents directory.
 */
export function downloadSpeechModel(
  onProgress: (fraction: number) => void,
  onComplete: () => void,
  onError: (message: string) => void,
): SpeechDownloadHandle {
  if (!speechAvailable) {
    void Promise.resolve().then(() => onError('Voice input is not available on this device.'));
    return { cancel: () => {} };
  }
  if (activeSpeechDownload) {
    void Promise.resolve().then(() => onError('The speech pack is already downloading.'));
    return { cancel: () => {} };
  }

  const run: ActiveSpeechDownload = {
    cancelled: false,
    installing: false,
    nativeHandle: null,
    done: Promise.resolve(),
    cancel: () => {},
  };
  run.cancel = () => {
    if (run.cancelled) return;
    run.cancelled = true;
    void run.nativeHandle?.cancelAsync().catch(() => {});
    // prepareModel is cancellable through the native model-operation token;
    // removeModel increments it so extraction/loading stops promptly.
    if (run.installing) void VoskSpeech.removeModel().catch(() => {});
  };
  activeSpeechDownload = run;

  run.done = (async () => {
    let target: string | null = null;
    try {
      target = zipPath();
      const parsed = new URL(SPEECH_MODEL_URL);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw new Error('The speech pack URL is not secure.');
      }
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (run.cancelled || activeSpeechDownload !== run) return;
      const download = FileSystem.createDownloadResumable(
        SPEECH_MODEL_URL,
        target,
        {},
        (progress) => {
          const total = progress.totalBytesExpectedToWrite ?? 0;
          const written = progress.totalBytesWritten ?? 0;
          if (!run.cancelled && activeSpeechDownload === run && total > 0) {
            onProgress(Math.min(1, written / total));
          }
        },
      );
      run.nativeHandle = download;

      const result = await download.downloadAsync();
      if (run.cancelled || activeSpeechDownload !== run) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        return;
      }
      if (!result || result.status !== 200) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        onError('The speech pack could not be downloaded. Check your connection and try again.');
        return;
      }
      const declaredLength = Object.entries(result.headers).find(
        ([name]) => name.toLowerCase() === 'content-length',
      )?.[1];
      if (declaredLength && Number(declaredLength) !== SPEECH_MODEL_SIZE_BYTES) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        onError('The speech pack changed at its source. Please try again later.');
        return;
      }
      if (!(await isUsableSpeechArchive(target))) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        if (!run.cancelled && activeSpeechDownload === run) {
          onError('The downloaded speech pack is incomplete or invalid. Please try again.');
        }
        return;
      }
      if (run.cancelled || activeSpeechDownload !== run) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        return;
      }

      run.installing = true;
      await VoskSpeech.prepareModel(target, SPEECH_MODEL_FILE_NAME);
      run.installing = false;
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (run.cancelled || activeSpeechDownload !== run) {
        await VoskSpeech.removeModel().catch(() => {});
        return;
      }
      onComplete();
    } catch (error) {
      if (target) await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (!run.cancelled && activeSpeechDownload === run) {
        onError(error instanceof Error ? error.message : 'The speech pack could not be installed.');
      }
    } finally {
      run.installing = false;
      if (activeSpeechDownload === run) activeSpeechDownload = null;
    }
  })();

  return {
    cancel: run.cancel,
  };
}

export async function removeSpeechModel(): Promise<void> {
  const download = activeSpeechDownload;
  if (download) {
    download.cancel();
    await download.done.catch(() => {});
  }
  if (speechAvailable) {
    const removed = await VoskSpeech.removeModel();
    if (removed !== true) throw new Error('The installed speech pack could not be removed.');
  }
  const dir = FileSystem.documentDirectory;
  if (dir) await FileSystem.deleteAsync(`${dir}${SPEECH_MODEL_FILE_NAME}`, { idempotent: true });
}

export function startSpeech(): void {
  if (speechAvailable) VoskSpeech.startListening();
}

export function stopSpeech(): void {
  if (speechAvailable) VoskSpeech.stopListening();
}

export function shutdownSpeech(): void {
  if (speechAvailable) VoskSpeech.shutdown();
}
