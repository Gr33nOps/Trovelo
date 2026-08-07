import * as SecureStore from 'expo-secure-store';

import { AI_TASKS, AiCancelledError, AiTaskId, buildMessages, cleanOutput, predictBudget } from './ai';
import { AiProviderPreset, RemoteAiConfig } from '../types';

/**
 * The API key for whichever remote provider is configured lives here, in the
 * OS keystore, never in the AsyncStorage record the rest of Settings shares
 * and never in a backup file. Only one remote provider is configured at a
 * time in this version, so one fixed key is enough; switching providers in
 * Settings means entering a new key.
 */
const API_KEY_STORAGE_KEY = 'trovelo-remote-ai-key';
/** The key slot used before the Trovelo rename; moved over on first read. */
const LEGACY_API_KEY_STORAGE_KEY = 'serendipity-remote-ai-key';

export async function getRemoteApiKey(): Promise<string | null> {
  try {
    let key = await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
    if (key === null) {
      const legacy = await SecureStore.getItemAsync(LEGACY_API_KEY_STORAGE_KEY);
      if (legacy !== null) {
        await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, legacy).catch(() => {});
        key = legacy;
      }
    }
    return key;
  } catch {
    return null;
  }
}

export async function setRemoteApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await clearRemoteApiKey();
    return;
  }
  await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, trimmed);
}

export async function clearRemoteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY).catch(() => {});
}

export interface ProviderPresetInfo {
  id: AiProviderPreset;
  label: string;
  baseUrl: string;
  defaultModel: string;
  modelHint: string;
  /** Where to get a key. Empty for the custom preset, which has no fixed provider. */
  keyUrl: string;
  freeTierNote: string;
}

/**
 * Verified against each provider's own docs at the time this was written.
 * Free tiers and model rosters change on their own schedule, not this app's,
 * so `freeTierNote` is deliberately conservative rather than promising a
 * specific quota that may have moved on.
 */
export const PROVIDER_PRESETS: ProviderPresetInfo[] = [
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    modelHint: 'e.g. llama-3.3-70b-versatile, llama-3.1-8b-instant',
    keyUrl: 'https://console.groq.com/keys',
    freeTierNote: 'Free tier, no card needed, rate limited.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    modelHint: 'A model id ending in :free costs nothing. The free list rotates over time.',
    keyUrl: 'https://openrouter.ai/keys',
    freeTierNote: 'Free models available, no card needed, rate limited.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-1.5-flash',
    modelHint: 'e.g. gemini-1.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeTierNote: 'Free tier, no card needed, rate limited.',
  },
  {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    defaultModel: '',
    modelHint: 'Any OpenAI-compatible endpoint: Ollama, LM Studio, a self-host, another host.',
    keyUrl: '',
    freeTierNote: '',
  },
];

export function getPreset(id: AiProviderPreset): ProviderPresetInfo {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}

export class RemoteAiError extends Error {}

const REQUEST_TIMEOUT_MS = 30_000;

function describeHttpError(status: number): string {
  if (status === 401 || status === 403) return 'That API key was rejected. Check it in Settings.';
  if (status === 429) return 'Rate limited by the provider. Wait a moment and try again.';
  if (status >= 500) return "The provider's server had a problem. Try again shortly.";
  return `The provider returned an error (${status}).`;
}

export interface RunRemoteOptions {
  knownTags?: string[];
  /** Lets the caller cancel the request the same way local generation is stopped. */
  signal?: AbortSignal;
}

/**
 * Runs one task against a user-configured OpenAI-compatible endpoint.
 *
 * Non-streaming by design: React Native's `fetch` has no `ReadableStream`,
 * so real token-by-token SSE needs either an XHR-based workaround or a new
 * streaming dependency. These are short completions, a title, a tag list, a
 * rewrite of a short note, so a single request-response with a spinner is a
 * reasonable v1 trade against adding that dependency now.
 */
export async function runRemoteTask(
  taskId: AiTaskId,
  text: string,
  config: RemoteAiConfig,
  apiKey: string,
  options: RunRemoteOptions = {},
): Promise<string> {
  const task = AI_TASKS[taskId];
  const source = text.trim();
  if (!source) return '';

  if (options.signal?.aborted) throw new AiCancelledError();

  const messages = buildMessages(taskId, source, options.knownTags ?? []);

  // The caller's signal (from the Stop button) and a fixed timeout both need
  // to be able to abort the same request; combined manually rather than with
  // `AbortSignal.any`, which is not reliably available across RN's JS engine.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: predictBudget(task, source.length),
        temperature: task.temperature,
        stop: task.extraStops && task.extraStops.length > 0 ? task.extraStops : undefined,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw new AiCancelledError();
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RemoteAiError('That took too long. Try again.');
    }
    throw new RemoteAiError('Could not reach the provider. Check your connection.');
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) {
    throw new RemoteAiError(describeHttpError(response.status));
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RemoteAiError('The provider sent back something unreadable.');
  }

  const raw = (json as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message
    ?.content;
  if (typeof raw !== 'string') {
    throw new RemoteAiError('The provider sent back something unexpected.');
  }

  return cleanOutput(raw, task, source.length);
}
