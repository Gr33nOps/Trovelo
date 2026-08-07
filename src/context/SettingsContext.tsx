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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getModelById } from '../constants/models';
import { getModelPath } from '../services/modelStore';
import { LEGACY_AI_KEYS, SETTINGS_KEY } from '../storage/storage';
import {
  AiEngineKind,
  AiProviderPreset,
  RemoteAiConfig,
  VoiceProvider,
  isAiProviderPreset,
  isVoiceProvider,
} from '../types';

const LEGACY_KEYS = LEGACY_AI_KEYS;

export interface Settings {
  aiEnabled: boolean;
  selectedModelPath: string | null;
  /** Master switch for haptic feedback. */
  hapticsEnabled: boolean;
  /** Offer a title suggestion when saving an untitled idea. */
  aiSuggestTitle: boolean;
  /** Only download models while on Wi-Fi-like (unmetered) connections. */
  warnOnLargeDownload: boolean;
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
  aiSuggestTitle: true,
  warnOnLargeDownload: true,
  voiceProvider: 'vosk',
  aiEngine: 'local',
  remoteAiConfig: null,
};

interface SettingsContextValue extends Settings {
  ready: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setAiEnabled: (enabled: boolean) => void;
  setSelectedModelPath: (path: string | null) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function coerceRemoteConfig(raw: unknown): RemoteAiConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const preset: AiProviderPreset = isAiProviderPreset(value.preset) ? value.preset : 'custom';
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  if (!baseUrl || !model) return null;
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : preset;
  return { preset, label, baseUrl, model };
}

function coerce(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULTS };
  const value = raw as Record<string, unknown>;
  const bool = (key: 'aiEnabled' | 'hapticsEnabled' | 'aiSuggestTitle' | 'warnOnLargeDownload'): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : DEFAULTS[key];
  return {
    aiEnabled: bool('aiEnabled'),
    selectedModelPath:
      typeof value.selectedModelPath === 'string' && value.selectedModelPath
        ? value.selectedModelPath
        : null,
    hapticsEnabled: bool('hapticsEnabled'),
    aiSuggestTitle: bool('aiSuggestTitle'),
    warnOnLargeDownload: bool('warnOnLargeDownload'),
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
  settingsRef.current = settings;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        if (raw) {
          const parsed = coerce(JSON.parse(raw));
          if (active) {
            settingsRef.current = parsed;
            setSettings(parsed);
          }
          return;
        }

        // Migrate the v1 keys, including the era when only a model *id* was stored.
        const [enabledRaw, storedPath, legacyId] = await Promise.all([
          AsyncStorage.getItem(LEGACY_KEYS.aiEnabled),
          AsyncStorage.getItem(LEGACY_KEYS.modelPath),
          AsyncStorage.getItem(LEGACY_KEYS.modelId),
        ]);
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
        if (active) {
          settingsRef.current = migrated;
          setSettings(migrated);
        }
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
        await AsyncStorage.multiRemove(Object.values(LEGACY_KEYS));
      } catch {
        // Fall back to defaults; the user can set things again.
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const set = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    setSettings(next);
    void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const setAiEnabled = useCallback((enabled: boolean) => set('aiEnabled', enabled), [set]);
  const setSelectedModelPath = useCallback(
    (path: string | null) => set('selectedModelPath', path),
    [set],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ ...settings, ready, set, setAiEnabled, setSelectedModelPath }),
    [settings, ready, set, setAiEnabled, setSelectedModelPath],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
