import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

import {
  AI_TASKS,
  AiBusyError,
  AiCancelledError,
  AiTaskId,
  beginGeneration,
  buildMessages,
  cleanOutput,
  endGeneration,
  generationIsActive,
  predictBudget,
} from './ai';
import { AiProviderPreset, RemoteAiConfig } from '../types';

/** Old unscoped slots, retained only long enough to migrate an existing install. */
const API_KEY_STORAGE_KEY = 'trovelo-remote-ai-key';
const LEGACY_API_KEY_STORAGE_KEY = 'serendipity-remote-ai-key';
const API_KEY_REGISTRY_KEY = 'trovelo-remote-ai-key-registry-v2';
const SCOPED_KEY_PREFIX = 'trovelo-remote-ai-key-v2-';

async function apiKeyStorageKey(config: RemoteAiConfig): Promise<string> {
  const endpoint = normalizeRemoteBaseUrl(config.baseUrl);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${config.preset}\u0000${endpoint}`,
  );
  return `${SCOPED_KEY_PREFIX}${config.preset}-${hash}`;
}

async function readKeyRegistry(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(API_KEY_REGISTRY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter(
          (value): value is string => typeof value === 'string' && value.startsWith(SCOPED_KEY_PREFIX),
        ),
      ),
    ];
  } catch {
    return [];
  }
}

async function registerKey(storageKey: string): Promise<void> {
  const keys = await readKeyRegistry();
  if (keys.includes(storageKey)) return;
  await SecureStore.setItemAsync(API_KEY_REGISTRY_KEY, JSON.stringify([...keys, storageKey]));
}

async function unregisterKey(storageKey: string): Promise<void> {
  const keys = (await readKeyRegistry()).filter((key) => key !== storageKey);
  if (keys.length === 0) await SecureStore.deleteItemAsync(API_KEY_REGISTRY_KEY);
  else await SecureStore.setItemAsync(API_KEY_REGISTRY_KEY, JSON.stringify(keys));
}

async function deleteUnscopedKeys(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY),
    SecureStore.deleteItemAsync(LEGACY_API_KEY_STORAGE_KEY),
  ]);
}

/** Reads the key belonging to this provider endpoint, migrating the old one-slot format once. */
export async function getRemoteApiKey(config: RemoteAiConfig): Promise<string | null> {
  try {
    const scopedStorageKey = await apiKeyStorageKey(config);
    const scoped = await SecureStore.getItemAsync(scopedStorageKey);
    if (scoped !== null) return scoped;

    const previous =
      (await SecureStore.getItemAsync(API_KEY_STORAGE_KEY)) ??
      (await SecureStore.getItemAsync(LEGACY_API_KEY_STORAGE_KEY));
    if (previous === null) return null;

    // Do not delete the only copy until the scoped write has succeeded.
    await registerKey(scopedStorageKey);
    await SecureStore.setItemAsync(scopedStorageKey, previous);
    await deleteUnscopedKeys();
    return previous;
  } catch {
    return null;
  }
}

export async function setRemoteApiKey(config: RemoteAiConfig, key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await clearRemoteApiKey(config);
    return;
  }
  const storageKey = await apiKeyStorageKey(config);
  await registerKey(storageKey);
  await SecureStore.setItemAsync(storageKey, trimmed);
  await deleteUnscopedKeys();
}

export async function clearRemoteApiKey(config: RemoteAiConfig): Promise<void> {
  const storageKey = await apiKeyStorageKey(config);
  // These operations intentionally reject on keystore failure so the UI never
  // claims a secret was removed when it was not.
  await SecureStore.deleteItemAsync(storageKey);
  await unregisterKey(storageKey);
  await deleteUnscopedKeys();
}

/** Deletes every provider-scoped API key, including inactive custom endpoints. */
export async function clearAllRemoteApiKeys(): Promise<void> {
  const registered = await readKeyRegistry();
  await Promise.all(
    [...new Set([...registered, API_KEY_STORAGE_KEY, LEGACY_API_KEY_STORAGE_KEY])].map((storageKey) =>
      SecureStore.deleteItemAsync(storageKey),
    ),
  );
  await SecureStore.deleteItemAsync(API_KEY_REGISTRY_KEY);
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
    defaultModel: 'openai/gpt-oss-20b',
    modelHint: 'e.g. openai/gpt-oss-20b, openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys',
    freeTierNote: 'Free tier, no card needed, rate limited.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    modelHint: 'Use openrouter/free, or a current model id ending in :free.',
    keyUrl: 'https://openrouter.ai/keys',
    freeTierNote: 'Free models available, no card needed, rate limited.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.6-flash',
    modelHint: 'e.g. gemini-3.6-flash, gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeTierNote: 'Free tier, no card needed, rate limited.',
  },
  {
    id: 'custom',
    label: 'Custom',
    baseUrl: '',
    defaultModel: '',
    modelHint: 'Any HTTPS OpenAI-compatible endpoint and model id.',
    keyUrl: '',
    freeTierNote: '',
  },
];

export function getPreset(id: AiProviderPreset): ProviderPresetInfo {
  return PROVIDER_PRESETS.find((preset) => preset.id === id) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}

export class RemoteAiError extends Error {}

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Returns a canonical HTTPS base URL or throws before a secret can leave the device. */
export function normalizeRemoteBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new RemoteAiError('Enter a valid provider URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new RemoteAiError('The provider URL must use HTTPS so your API key stays private.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new RemoteAiError('The provider URL cannot contain credentials, a query, or a fragment.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  return parsed.toString().replace(/\/$/, '');
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      index += 1;
      bytes += 4;
    } else bytes += 3;
  }
  return bytes;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new RemoteAiError('The provider response was unexpectedly large.');
  }
  const body = await response.text();
  if (utf8Length(body) > MAX_RESPONSE_BYTES) {
    throw new RemoteAiError('The provider response was unexpectedly large.');
  }
  return body;
}

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
  if (!apiKey.trim()) throw new RemoteAiError('Add an API key for the cloud provider in Settings.');
  if (!config.model.trim()) throw new RemoteAiError('Choose a model for the cloud provider in Settings.');

  const messages = buildMessages(taskId, source, options.knownTags ?? []);
  const baseUrl = normalizeRemoteBaseUrl(config.baseUrl);

  // The caller's signal (from the Stop button) and a fixed timeout both need
  // to be able to abort the same request; combined manually rather than with
  // `AbortSignal.any`, which is not reliably available across RN's JS engine.
  const controller = new AbortController();
  const generation = beginGeneration(options.signal, () => controller.abort());
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        max_tokens: predictBudget(task, source.length),
        // Gemini 3.6 deprecated sampling parameters. Other compatible APIs
        // still use the task-specific temperature.
        ...(config.preset === 'gemini' ? {} : { temperature: task.temperature }),
        stop: task.extraStops && task.extraStops.length > 0 ? task.extraStops : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new RemoteAiError(describeHttpError(response.status));
    }

    let json: unknown;
    try {
      json = JSON.parse(await readBoundedBody(response));
    } catch (error) {
      if (error instanceof RemoteAiError) throw error;
      throw new RemoteAiError('The provider sent back something unreadable.');
    }

    const raw = (json as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]
      ?.message?.content;
    if (typeof raw !== 'string') {
      throw new RemoteAiError('The provider sent back something unexpected.');
    }

    if (!generationIsActive(generation)) throw new AiCancelledError();
    return cleanOutput(raw, task, source.length);
  } catch (error) {
    if (!generationIsActive(generation) || options.signal?.aborted) throw new AiCancelledError();
    if (timedOut || (error instanceof Error && error.name === 'AbortError')) {
      throw new RemoteAiError('That took too long. Try again.');
    }
    if (error instanceof RemoteAiError || error instanceof AiBusyError) throw error;
    throw new RemoteAiError('Could not reach the provider. Check your connection.');
  } finally {
    clearTimeout(timeout);
    endGeneration(generation);
  }

}
