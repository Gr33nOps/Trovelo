import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const { AndroidSpeech } = NativeModules;

export const ANDROID_SPEECH_EVENTS = {
  partial: 'AndroidSpeechPartial',
  result: 'AndroidSpeechResult',
  error: 'AndroidSpeechError',
} as const;

/** The native module is compiled in; this does not mean a device has a recognition service. */
export const androidSpeechModuleAvailable: boolean = AndroidSpeech != null && Platform.OS === 'android';

export const androidSpeechEvents = androidSpeechModuleAvailable ? new NativeEventEmitter(AndroidSpeech) : null;

/**
 * Whether a recognition service (the Google app, on almost every phone) is
 * actually installed. Checked live rather than cached: it is not something
 * that changes often, but it can, and there is nothing to download or set up
 * on this app's side that would otherwise invalidate a cached answer.
 */
export async function isAndroidSpeechAvailable(): Promise<boolean> {
  if (!androidSpeechModuleAvailable) return false;
  try {
    return (await AndroidSpeech.isAvailable()) === true;
  } catch {
    return false;
  }
}

export function startAndroidSpeech(): void {
  if (androidSpeechModuleAvailable) AndroidSpeech.startListening();
}

export function stopAndroidSpeech(): void {
  if (androidSpeechModuleAvailable) AndroidSpeech.stopListening();
}

export function shutdownAndroidSpeech(): void {
  if (androidSpeechModuleAvailable) AndroidSpeech.shutdown();
}
