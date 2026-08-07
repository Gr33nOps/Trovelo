import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { DefaultTheme, NavigationContainer, Theme as NavTheme } from '@react-navigation/native';
import {
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  useFonts,
} from '@expo-google-fonts/source-sans-3';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from './src/components/ErrorBoundary';
import { DownloadProvider } from './src/context/DownloadContext';
import { EntriesProvider, useEntries } from './src/context/EntriesContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { ToastProvider } from './src/context/ToastContext';
import { RootNavigator } from './src/navigation';
import { installAiLifecycleHooks } from './src/services/ai';
import { cleanBackupCache } from './src/services/backup';
import { migrateLegacyKeys } from './src/storage/storage';

// Hold the native splash until the first screen is genuinely ready to draw.
// Previously the providers rendered `null` while reading from disk, which
// showed a blank frame between the splash and the app.
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Move any data stored under the old `@serendipity/*` keys to `@trovelo/*`
  // before any provider reads, so the rename is invisible to existing users.
  const [keysMigrated, setKeysMigrated] = useState(false);
  const [fontsLoaded] = useFonts({
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
  });

  useEffect(() => {
    let active = true;
    void migrateLegacyKeys().finally(() => {
      if (active) setKeysMigrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const removeAiHooks = installAiLifecycleHooks();
    // Sweep any backup file left in the cache by a previous session.
    void cleanBackupCache();
    return removeAiHooks;
  }, []);

  if (!keysMigrated || !fontsLoaded) {
    // Behind the still-visible native splash, so the flash is never shown.
    return <View style={{ flex: 1, backgroundColor: '#FAFAF8' }} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <SettingsProvider>
          <ThemeProvider>
            <DownloadProvider>
              <EntriesProvider>
                <ToastProvider>
                  <AppShell />
                </ToastProvider>
              </EntriesProvider>
            </DownloadProvider>
          </ThemeProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function AppShell() {
  const { isDark, palette, ready: themeReady, registerAppOpen } = useTheme();
  const { ready: settingsReady } = useSettings();
  const { loaded: entriesLoaded } = useEntries();

  const ready = themeReady && settingsReady && entriesLoaded;

  useEffect(() => {
    if (themeReady) registerAppOpen();
  }, [themeReady, registerAppOpen]);

  useEffect(() => {
    // Paints the window background so rotation and keyboard transitions do not
    // flash white behind the app.
    void SystemUI.setBackgroundColorAsync(palette.backdrop).catch(() => {});
  }, [palette.backdrop]);

  const onLayout = useCallback(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const navTheme = useMemo<NavTheme>(
    () => ({
      ...DefaultTheme,
      dark: isDark,
      colors: {
        primary: palette.accent,
        background: palette.backdrop,
        card: palette.panel,
        text: palette.ink,
        border: palette.edge,
        notification: palette.danger,
      },
    }),
    [isDark, palette],
  );

  if (!ready) {
    // Matches the splash background exactly, so the handover is invisible.
    return <View style={{ flex: 1, backgroundColor: palette.backdrop }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.backdrop }} onLayout={onLayout}>
      <NavigationContainer theme={navTheme}>
        {/*
          The nav bar now matches the page (neutral chrome), so the status-bar
          icons contrast with the backdrop, not with an accent fill.
        */}
        <StatusBar style={palette.mood === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}
