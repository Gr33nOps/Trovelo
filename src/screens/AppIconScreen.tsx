import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppMark } from '../components/AppMark';
import { ACCENT_COLORS, PAGE_PAD, palettes, radius as radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { accentForIconName, appIconModuleAvailable, getAppIcon, ICON_ACCENT_ORDER, setAppIcon } from '../services/appIcon';
import { AccentId } from '../types';
import { EmptyState } from '../ui/EmptyState';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'AppIcon'>;

function optionOpacity(disabled: boolean, selected: boolean, pressed: boolean): number {
  if (disabled && !selected) return 0.5;
  return pressed ? 0.7 : 1;
}

export default function AppIconScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette, accentId: liveAccentId, isDark: liveIsDark, appIconMode, setAppIconMode } = useTheme();
  const haptics = useHaptics();
  const toast = useToast();

  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void getAppIcon().then(setCurrent);
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const choose = async (accentId: AccentId, isDark: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      setAppIconMode('manual');
      await setAppIcon(accentId, isDark);
      refresh();
      haptics.success();
      toast.show({ message: 'App icon changed. Check your home screen.', tone: 'success' });
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'The app icon could not be changed.',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
    }
  };

  const chooseAuto = async () => {
    if (busy || appIconMode === 'auto') return;
    setBusy(true);
    try {
      setAppIconMode('auto');
      await setAppIcon(liveAccentId, liveIsDark);
      refresh();
      haptics.success();
      toast.show({ message: 'App icon will now match your theme.', tone: 'success' });
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'The app icon could not be changed.',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!appIconModuleAvailable) {
    return (
      <Backdrop>
        <NavBar title="App icon" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="apps-outline"
          title="Not available here"
          subtitle="Changing the home-screen icon only works in a real installed build on Android, not in this preview."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </Backdrop>
    );
  }

  const selected = current && appIconMode === 'manual' ? accentForIconName(current) : null;

  return (
    <Backdrop>
      <NavBar title="App icon" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Panel style={styles.intro} borderRadius={radii.lg}>
          <Ionicons name="information-circle-outline" size={18} color={palette.inkFaint} />
          <Type role="caption" style={styles.introText}>
            Pick which icon shows on your home screen, or leave it matching your theme and accent colour
            automatically.
          </Type>
        </Panel>

        <Pressable
          onPress={() => void chooseAuto()}
          disabled={busy}
          accessibilityRole="radio"
          accessibilityState={{ selected: appIconMode === 'auto', disabled: busy }}
          style={({ pressed }) => [
            styles.autoRow,
            {
              borderRadius: radii.lg,
              borderColor: appIconMode === 'auto' ? palette.accent : palette.edge,
              backgroundColor: appIconMode === 'auto' ? palette.accentSoft : palette.panel,
              opacity: optionOpacity(busy, appIconMode === 'auto', pressed),
            },
          ]}
        >
          <AppMark size={44} />
          <View style={styles.autoText}>
            <Type role="bodyStrong">Match app appearance</Type>
            <Type role="caption" color={palette.inkSoft}>
              Follows your theme and accent colour automatically
            </Type>
          </View>
          {appIconMode === 'auto' ? <Ionicons name="checkmark-circle" size={20} color={palette.accent} /> : null}
        </Pressable>

        {ICON_ACCENT_ORDER.map((accentId) => {
          const def = ACCENT_COLORS.find((option) => option.id === accentId);
          if (!def) return null;
          return (
            <View key={accentId} style={styles.row}>
              <Type role="label" pressed>
                {def.label}
              </Type>
              <View style={styles.swatchRow}>
                <IconOption
                  label="Light"
                  accentColor={def.light}
                  background={palettes.light.backdrop}
                  borderColor={palettes.light.edge}
                  selected={selected?.accentId === accentId && selected.isDark === false}
                  disabled={busy}
                  onPress={() => void choose(accentId, false)}
                />
                <IconOption
                  label="Dark"
                  accentColor={def.dark}
                  background={palettes.dark.backdrop}
                  borderColor={palettes.dark.edge}
                  selected={selected?.accentId === accentId && selected.isDark === true}
                  disabled={busy}
                  onPress={() => void choose(accentId, true)}
                />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Backdrop>
  );
}

function IconOption({
  label,
  accentColor,
  background,
  borderColor,
  selected,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly accentColor: string;
  readonly background: string;
  readonly borderColor: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${label} icon`}
      style={({ pressed }) => [styles.option, { opacity: optionOpacity(disabled, selected, pressed) }]}
    >
      <View
        style={[
          styles.optionRing,
          {
            borderRadius: radii.xl,
            borderColor: selected ? palette.accent : 'transparent',
            backgroundColor: selected ? palette.accentSoft : 'transparent',
          },
        ]}
      >
        <AppMark size={52} accentColor={accentColor} background={background} borderColor={borderColor} />
        {selected ? (
          <View style={[styles.check, { backgroundColor: palette.accent, borderRadius: radii.pill }]}>
            <Ionicons name="checkmark" size={11} color={palette.accentInk} />
          </View>
        ) : null}
      </View>
      <Type role="caption" color={palette.inkSoft}>
        {label}
      </Type>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: spacing.md,
    gap: spacing.xl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  introText: {
    flex: 1,
    lineHeight: 20,
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1.5,
  },
  autoText: {
    flex: 1,
    gap: 2,
  },
  row: {
    gap: spacing.sm,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.xl,
  },
  option: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  optionRing: {
    padding: 4,
    borderWidth: 2,
  },
  check: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
