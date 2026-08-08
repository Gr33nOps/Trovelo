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
import { useColorScheme } from 'react-native';

import {
  Palette,
  buildPalette,
  fontSizes,
  fonts,
  radius,
  spacing,
} from '../constants/theme';
import {
  DEFAULT_PREFERENCES,
  clearStoredPreferences,
  loadPreferences,
  savePreferences,
} from '../storage/storage';
import { AccentId, Preferences, ThemeMode } from '../types';
import { todayKey, yesterdayKey } from '../utils/date';

export interface Theme {
  isDark: boolean;
  mode: ThemeMode;
  accentId: AccentId;
  palette: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSizes: typeof fontSizes;
  fonts: typeof fonts;
  streak: number;
  bestStreak: number;
  daysOpened: number;
  onboarded: boolean;
  /** True once preferences have been read from disk. */
  ready: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccentId: (accentId: AccentId) => void;
  completeOnboarding: () => void;
  registerAppOpen: () => void;
  /** Clears preferences on disk and restores the provider's in-memory defaults. */
  resetPreferences: () => Promise<void>;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);

  /**
   * Preferences live in one object so a write never clobbers a field it did
   * not intend to change. Previously each writer re-read from disk and wrote a
   * whole record back, which meant a theme change in flight could resurrect a
   * stale streak (and `registerAppOpen` could reset a mode the user had just
   * picked).
   */
  const prefsRef = useRef(prefs);
  const persistenceReady = useRef(false);
  prefsRef.current = prefs;

  const commit = useCallback((mutate: (current: Preferences) => Preferences) => {
    const next = mutate(prefsRef.current);
    prefsRef.current = next;
    setPrefs(next);
    if (persistenceReady.current) {
      void savePreferences(next).catch((error) => {
        if (__DEV__) console.warn('[theme] failed to persist preferences', error);
      });
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadPreferences()
      .then((stored) => {
        if (!active) return;
        persistenceReady.current = true;
        prefsRef.current = stored;
        setPrefs(stored);
      })
      .catch((error) => {
        // Do not let a failed/corrupt read turn into a write of defaults. The
        // app can still render with defaults, and an explicit reset recovers it.
        persistenceReady.current = false;
        if (__DEV__) console.warn('[theme] preference hydration failed', error);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setMode = useCallback(
    (mode: ThemeMode) => commit((current) => ({ ...current, themeMode: mode })),
    [commit],
  );

  const setAccentId = useCallback(
    (accentId: AccentId) => commit((current) => ({ ...current, accentId })),
    [commit],
  );

  const completeOnboarding = useCallback(
    () => commit((current) => ({ ...current, onboarded: true })),
    [commit],
  );

  const registerAppOpen = useCallback(() => {
    commit((current) => {
      const today = todayKey();
      if (current.lastOpenDay === today) return current;
      const streak = current.lastOpenDay === yesterdayKey() ? current.streak + 1 : 1;
      return {
        ...current,
        streak,
        bestStreak: Math.max(current.bestStreak, streak),
        lastOpenDay: today,
        daysOpened: current.daysOpened + 1,
      };
    });
  }, [commit]);

  const resetPreferences = useCallback(async () => {
    await clearStoredPreferences();
    const defaults = { ...DEFAULT_PREFERENCES };
    persistenceReady.current = true;
    prefsRef.current = defaults;
    setPrefs(defaults);
    setReady(true);
  }, []);

  const isDark = prefs.themeMode === 'system' ? systemScheme === 'dark' : prefs.themeMode === 'dark';
  const palette = buildPalette(isDark ? 'dark' : 'light', prefs.accentId);

  const value = useMemo<Theme>(
    () => ({
      isDark,
      mode: prefs.themeMode,
      accentId: prefs.accentId,
      palette,
      spacing,
      radius,
      fontSizes,
      fonts,
      streak: prefs.streak,
      bestStreak: prefs.bestStreak,
      daysOpened: prefs.daysOpened,
      onboarded: prefs.onboarded,
      ready,
      setMode,
      setAccentId,
      completeOnboarding,
      registerAppOpen,
      resetPreferences,
    }),
    [
      isDark,
      palette,
      prefs.themeMode,
      prefs.accentId,
      prefs.streak,
      prefs.bestStreak,
      prefs.daysOpened,
      prefs.onboarded,
      ready,
      setMode,
      setAccentId,
      completeOnboarding,
      registerAppOpen,
      resetPreferences,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
