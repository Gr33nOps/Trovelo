import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AppMark } from '../components/AppMark';
import { ACCENT_COLORS, PAGE_PAD, palettes, radius as radii, spacing, withAlpha } from '../constants/theme';
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

export default function AppIconScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
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
      await setAppIcon(accentId, isDark);
      refresh();
      haptics.success();
      toast.show({ message: 'App icon changed. Check your home screen.', tone: 'success' });
    } catch (caught) {
      haptics.warning();
      toast.show({
        message: caught instanceof Error ? caught.message : 'The app icon could not be changed.',
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

  const selected = current ? accentForIconName(current) : null;

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
            Pick which icon shows on your home screen. This changes the icon itself — it doesn&apos;t change the
            accent colour used inside the app, though picking the same one keeps them matching.
          </Type>
        </Panel>

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
                  accentId={accentId}
                  isDark={false}
                  accentColor={def.light}
                  background={palettes.light.backdrop}
                  borderColor={palettes.light.edge}
                  selected={selected?.accentId === accentId && selected.isDark === false}
                  disabled={busy}
                  onPress={() => void choose(accentId, false)}
                />
                <IconOption
                  label="Dark"
                  accentId={accentId}
                  isDark
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
  label: string;
  accentId: AccentId;
  isDark: boolean;
  accentColor: string;
  background: string;
  borderColor: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${label} icon`}
      style={({ pressed }) => [styles.option, { opacity: disabled && !selected ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.optionRing,
          {
            borderRadius: radii.xl,
            borderColor: selected ? palette.accent : 'transparent',
            backgroundColor: selected ? withAlpha(palette.accent, 0.1) : 'transparent',
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
