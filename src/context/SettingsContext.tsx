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

import { clearStoredSettings, loadSettingsRecord, saveSettingsRecord } from '../storage/storage';

export interface Settings {
  /** Master switch for haptic feedback. */
  hapticsEnabled: boolean;
}

const DEFAULTS: Settings = {
  hapticsEnabled: true,
};

interface SettingsContextValue extends Settings {
  ready: boolean;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** Clears settings on disk and restores the provider's in-memory defaults. */
  resetSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function coerce(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Stored settings are not an object.');
  }
  const value = raw as Record<string, unknown>;
  return {
    hapticsEnabled: typeof value.hapticsEnabled === 'boolean' ? value.hapticsEnabled : DEFAULTS.hapticsEnabled,
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
        const parsed = raw !== null ? coerce(raw) : { ...DEFAULTS };
        if (active) {
          settingsRef.current = parsed;
          setSettings(parsed);
        }
        persistenceReady.current = true;
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
    const next = { ...settingsRef.current, [key]: value };
    settingsRef.current = next;
    setSettings(next);
    if (persistenceReady.current) {
      void saveSettingsRecord(next).catch((error) => {
        if (__DEV__) console.warn('[settings] failed to persist settings', error);
      });
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
      resetSettings,
    }),
    [settings, ready, set, resetSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
