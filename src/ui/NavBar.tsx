import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SLOP, MIN_TOUCH, PAGE_PAD, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Type } from './Type';

export interface NavBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
  below?: ReactNode;
  /** Left-aligned page title (main tabs). */
  align?: 'center' | 'start';
  /** Large page title. */
  large?: boolean;
  borderless?: boolean;
}

/**
 * Minimal toolbar. Same horizontal inset as page content so titles line up
 * with everything below.
 */
export function NavBar({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  right,
  below,
  align = 'center',
  large = false,
  borderless = true,
}: NavBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const start = align === 'start';

  return (
    <View style={[styles.root, { backgroundColor: palette.backdrop }]}>
      <View style={{ height: insets.top }} />

      {start ? (
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderText} accessibilityRole="header">
            <Type role={large ? 'display' : 'title'} numberOfLines={1}>
              {title}
            </Type>
            {subtitle ? (
              <Type role="caption" color={palette.inkFaint} numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Type>
            ) : null}
          </View>
          {right ? <View style={styles.pageHeaderRight}>{right}</View> : null}
        </View>
      ) : (
        <View style={styles.bar}>
          <View style={styles.side}>
            {onBack ? <BackButton label={backLabel} onPress={onBack} /> : null}
          </View>
          <View style={styles.titleWrap} accessibilityRole="header">
            {title ? (
              <Type role="heading" align="center" numberOfLines={1}>
                {title}
              </Type>
            ) : null}
            {subtitle ? (
              <Type role="caption" color={palette.inkFaint} align="center" numberOfLines={1}>
                {subtitle}
              </Type>
            ) : null}
          </View>
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
      )}

      {below ? <View style={styles.below}>{below}</View> : null}

      {!borderless ? (
        <View style={[styles.rule, { backgroundColor: palette.edge }]} />
      ) : null}
    </View>
  );
}

function BackButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Type role="body" color={palette.ink}>
        {label}
      </Type>
    </Pressable>
  );
}

export function NavTextAction({
  label,
  onPress,
  disabled = false,
  accent = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: boolean;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.light();
        onPress();
      }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.textAction, { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 }]}
    >
      <Type role="bodyStrong" color={accent ? palette.accent : palette.ink}>
        {label}
      </Type>
    </Pressable>
  );
}

export function NavAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.light();
        onPress();
      }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.iconAction, { opacity: disabled ? 0.3 : pressed ? 0.5 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    zIndex: 10,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: PAGE_PAD,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    minHeight: 52,
  },
  pageHeaderText: {
    flex: 1,
    gap: 4,
  },
  pageHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: 2,
  },
  subtitle: {
    marginTop: 2,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: PAGE_PAD,
  },
  side: {
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  back: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  textAction: {
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  iconAction: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  below: {
    paddingHorizontal: PAGE_PAD,
    paddingBottom: spacing.md,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
  },
});
