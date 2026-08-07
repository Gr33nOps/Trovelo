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
export const SPEECH_MODEL_SIZE_BYTES = 41 * 1024 * 1024;

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
    onError('Voice input is not available on this device.');
    return { cancel: () => {} };
  }

  let cancelled = false;
  let handle: FileSystem.DownloadResumable | null = null;

  void (async () => {
    const target = zipPath();
    try {
      const download = FileSystem.createDownloadResumable(
        SPEECH_MODEL_URL,
        target,
        {},
        (progress) => {
          const total = progress.totalBytesExpectedToWrite ?? 0;
          const written = progress.totalBytesWritten ?? 0;
          if (total > 0) onProgress(Math.min(1, written / total));
        },
      );
      handle = download;

      const result = await download.downloadAsync();
      if (cancelled) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        return;
      }
      if (!result || result.status !== 200) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        onError('The speech pack could not be downloaded. Check your connection and try again.');
        return;
      }

      await VoskSpeech.prepareModel(target, SPEECH_MODEL_FILE_NAME);
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      onComplete();
    } catch (error) {
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      if (!cancelled) {
        onError(error instanceof Error ? error.message : 'The speech pack could not be installed.');
      }
    }
  })();

  return {
    cancel: () => {
      cancelled = true;
      void handle?.cancelAsync().catch(() => {});
    },
  };
}

export async function removeSpeechModel(): Promise<void> {
  if (speechAvailable) {
    await VoskSpeech.removeModel().catch(() => {});
  }
  try {
    await FileSystem.deleteAsync(zipPath(), { idempotent: true }).catch(() => {});
  } catch {
    // No documents directory, nothing to remove.
  }
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
