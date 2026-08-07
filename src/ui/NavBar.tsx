import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SLOP, MIN_TOUCH, fonts, fontSizes, spacing, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Type } from './Type';

export interface NavBarProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Rendered at the trailing edge; keep to one or two controls. */
  right?: ReactNode;
  /** Extra chrome docked below the title, e.g. a search field. */
  below?: ReactNode;
  /** Left-aligned brand/title layout used on main tabs. */
  align?: 'center' | 'start';
  /** Large serif title (Trovelo / Settings). */
  large?: boolean;
  /** Hide the bottom hairline. */
  borderless?: boolean;
}

/**
 * Editorial toolbar: cream bar, serif titles when large, plain text actions.
 * No logos — type alone carries the brand.
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
  borderless = false,
}: NavBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const ink = palette.ink;
  const start = align === 'start';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={palette.chromeGradient.colors}
        locations={palette.chromeGradient.locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ height: insets.top }} />

      {start ? (
        <View style={[styles.brandBar, large && styles.brandBarLarge]}>
          <View style={styles.brandTitleBlock} accessibilityRole="header">
            <Type
              role={large ? 'display' : 'title'}
              color={ink}
              numberOfLines={1}
              style={large ? styles.brandTitle : undefined}
            >
              {title}
            </Type>
            {subtitle ? (
              <Type role="caption" color={palette.inkFaint} numberOfLines={1} style={styles.brandSubtitle}>
                {subtitle}
              </Type>
            ) : null}
          </View>
          {right ? <View style={styles.brandRight}>{right}</View> : null}
        </View>
      ) : (
        <View style={styles.bar}>
          <View style={styles.side}>
            {onBack ? <BackButton label={backLabel} onPress={onBack} ink={ink} /> : null}
          </View>

          <View style={styles.titleWrap} accessibilityRole="header">
            <Type role="heading" color={ink} align="center" numberOfLines={1}>
              {title}
            </Type>
            {subtitle ? (
              <Type role="caption" color={palette.inkFaint} align="center" numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Type>
            ) : null}
          </View>

          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
      )}

      {below ? <View style={styles.below}>{below}</View> : null}

      {!borderless ? (
        <View pointerEvents="none" style={[styles.bottomRule, { backgroundColor: palette.chromeBorder }]} />
      ) : null}
    </View>
  );
}

function BackButton({ label, onPress, ink }: { label: string; onPress: () => void; ink: string }) {
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
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Type role="body" color={ink} numberOfLines={1} style={styles.backLabel}>
        {label}
      </Type>
    </Pressable>
  );
}

/** A toolbar text action (Save, Ask, etc.) — preferred over icons in the editorial UI. */
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
      style={({ pressed }) => [styles.textAction, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Type
        role="body"
        color={accent ? palette.accent : palette.ink}
        numberOfLines={1}
        style={styles.textActionLabel}
      >
        {label}
      </Type>
    </Pressable>
  );
}

/** A toolbar-tinted icon action for {@link NavBarProps.right}. */
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
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    zIndex: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  brandBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  brandBarLarge: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  brandTitleBlock: {
    flex: 1,
    gap: 4,
  },
  brandTitle: {
    fontFamily: fonts.display,
    fontSize: fontSizes.xxl,
    fontWeight: weights.bold,
    lineHeight: 42,
  },
  brandSubtitle: {
    fontSize: fontSizes.sm,
  },
  brandRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  side: {
    minWidth: 72,
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
    paddingHorizontal: spacing.xs,
  },
  subtitle: {
    opacity: 0.75,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    marginLeft: -2,
  },
  backLabel: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
  },
  textAction: {
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  textActionLabel: {
    fontFamily: fonts.bodySemibold,
    fontSize: fontSizes.md,
    fontWeight: weights.semibold,
  },
  action: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  below: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  bottomRule: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
