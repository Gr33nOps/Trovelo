import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getModelById } from '../constants/models';
import { getModelPath } from '../services/modelStore';
import {
  clearLegacySettingsFields,
  clearStoredSettings,
  loadLegacySettingsFields,
  loadSettingsRecord,
  saveSettingsRecord,
} from '../storage/storage';
import {
  AiEngineKind,
  AiProviderPreset,
  RemoteAiConfig,
  VoiceProvider,
  isAiProviderPreset,
  isVoiceProvider,
} from '../types';

export interface Settings {
  aiEnabled: boolean;
  selectedModelPath: string | null;
  /** Master switch for haptic feedback. */
  hapticsEnabled: boolean;
  /** Which dictation engine to use. Offline Vosk by default. */
  voiceProvider: VoiceProvider;
  /** Which engine runs assistant tasks when aiEnabled is true. Local (on this phone) by default. */
  aiEngine: AiEngineKind;
  /**
   * Everything about a configured remote provider except its key: label,
   * base URL, model id. The key itself lives in secure storage
   * (see `services/aiProvider.ts`), never here and never in a backup.
   */
  remoteAiConfig: RemoteAiConfig | null;
}

const DEFAULTS: Settings = {
  aiEnabled: false,
  selectedModelPath: null,
  hapticsEnabled: true,
  voiceProvider: 'vosk',
  aiEngine: 'local',
  remoteAiConfig: null,
};

interface SettingsContextValue extends Settings {
  ready: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setAiEnabled: (enabled: boolean) => void;
  setSelectedModelPath: (path: string | null) => void;
  /** Persists provider metadata before the save flow reports success. */
  setRemoteAiConfig: (config: RemoteAiConfig | null) => Promise<void>;
  /** Clears settings on disk and restores the provider's in-memory defaults. */
  resetSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function coerceRemoteConfig(raw: unknown): RemoteAiConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const preset: AiProviderPreset = isAiProviderPreset(value.preset) ? value.preset : 'custom';
  const rawBaseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim().slice(0, 2048) : '';
  const model = typeof value.model === 'string' ? value.model.trim().slice(0, 200) : '';
  if (!rawBaseUrl || !model) return null;
  let baseUrl: string;
  try {
    const parsed = new URL(rawBaseUrl);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    baseUrl = parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
  const label =
    typeof value.label === 'string' && value.label.trim()
      ? value.label.trim().slice(0, 80)
      : preset;
  return { preset, label, baseUrl, model };
}

function coerce(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Stored settings are not an object.');
  }
  const value = raw as Record<string, unknown>;
  const bool = (key: 'aiEnabled' | 'hapticsEnabled'): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULTS[key];
  return {
    aiEnabled: bool('aiEnabled'),
    selectedModelPath:
      typeof value.selectedModelPath === 'string' && value.selectedModelPath
        ? value.selectedModelPath
        : null,
    hapticsEnabled: bool('hapticsEnabled'),
    voiceProvider: isVoiceProvider(value.voiceProvider) ? value.voiceProvider : DEFAULTS.voiceProvider,
    aiEngine: value.aiEngine === 'remote' ? 'remote' : 'local',
    remoteAiConfig: coerceRemoteConfig(value.remoteAiConfig),
  };
}

/**
 * App preferences in a single record.
 *
 * Everything used to live in its own AsyncStorage key, which meant a growing
 * set of independent reads on startup. One record also makes migration a
 * single step.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  const persistenceReady = useRef(false);
  settingsRef.current = settings;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await loadSettingsRecord();
        if (raw !== null) {
          const parsed = coerce(raw);
          if (active) {
            settingsRef.current = parsed;
            setSettings(parsed);
          }
          persistenceReady.current = true;
          // Once the consolidated record exists, these snapshots are obsolete
          // and must not survive to be migrated back after a future reset.
          await clearLegacySettingsFields().catch((error) => {
            if (__DEV__) console.warn('[settings] legacy settings cleanup failed', error);
          });
          return;
        }

        // Migrate the v1 keys, including the era when only a model *id* was stored.
        const { aiEnabled: enabledRaw, modelPath: storedPath, modelId: legacyId } =
          await loadLegacySettingsFields();
        let path = storedPath;
        if (!path && legacyId) {
          const model = getModelById(legacyId);
          if (model) path = getModelPath(model);
        }
        const migrated: Settings = {
          ...DEFAULTS,
          aiEnabled: enabledRaw === 'true',
          selectedModelPath: path,
        };
        await saveSettingsRecord(migrated);
        await clearLegacySettingsFields().catch((error) => {
          if (__DEV__) console.warn('[settings] legacy settings cleanup failed', error);
        });
        persistenceReady.current = true;
        if (active) {
          settingsRef.current = migrated;
          setSettings(migrated);
        }
      } catch (error) {
        // Keep defaults usable in memory, but do not overwrite a record that
        // merely failed to read. An explicit reset can re-enable persistence.
        persistenceReady.current = false;
        if (__DEV__) console.warn('[settings] hydration failed', error);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    const safeValue = key === 'remoteAiConfig' ? coerceRemoteConfig(value) : value;
    const next = { ...settingsRef.current, [key]: safeValue } as Settings;
    settingsRef.current = next;
    setSettings(next);
    if (persistenceReady.current) {
      void saveSettingsRecord(next).catch((error) => {
        if (__DEV__) console.warn('[settings] failed to persist settings', error);
      });
    }
  }, []);

  const setAiEnabled = useCallback((enabled: boolean) => set('aiEnabled', enabled), [set]);
  const setSelectedModelPath = useCallback(
    (path: string | null) => set('selectedModelPath', path),
    [set],
  );

  const setRemoteAiConfig = useCallback(async (config: RemoteAiConfig | null) => {
    const safeConfig = coerceRemoteConfig(config);
    if (config !== null && safeConfig === null) {
      throw new Error('Enter a valid HTTPS provider URL and model.');
    }
    if (!persistenceReady.current) {
      throw new Error('Settings storage is unavailable. Restart the app or reset settings and try again.');
    }

    const previous = settingsRef.current;
    const next: Settings = { ...previous, remoteAiConfig: safeConfig };
    // Publish optimistically so a concurrent simple toggle incorporates the
    // provider config into its own newer snapshot instead of overwriting it.
    settingsRef.current = next;
    setSettings(next);
    try {
      await saveSettingsRecord(next);
    } catch (error) {
      // Do not roll back across a newer mutation. Its snapshot is authoritative.
      if (settingsRef.current === next) {
        settingsRef.current = previous;
        setSettings(previous);
      }
      throw error;
    }
  }, []);

  const resetSettings = useCallback(async () => {
    await clearStoredSettings();
    const defaults = { ...DEFAULTS };
    persistenceReady.current = true;
    settingsRef.current = defaults;
    setSettings(defaults);
    setReady(true);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      ready,
      set,
      setAiEnabled,
      setSelectedModelPath,
      setRemoteAiConfig,
      resetSettings,
    }),
    [settings, ready, set, setAiEnabled, setSelectedModelPath, setRemoteAiConfig, resetSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
