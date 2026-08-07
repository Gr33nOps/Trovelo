import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HIT_SLOP, MIN_TOUCH, radius as radii, spacing } from '../constants/theme';
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
}

/**
 * The toolbar: a neutral bar that matches the page, with ink type and a
 * single hairline separating it from the content. The accent colour is
 * reserved for what it means on the page, so a gold header no longer pulls
 * attention on every screen.
 *
 * React Navigation's native-stack header cannot render this directly, so
 * screens hide it and use this instead, which also keeps the back button,
 * title and actions identical everywhere.
 */
export function NavBar({ title, subtitle, onBack, backLabel = 'Back', right, below }: NavBarProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const ink = palette.ink;

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

      {below ? <View style={styles.below}>{below}</View> : null}

      <View pointerEvents="none" style={[styles.bottomRule, { backgroundColor: palette.chromeBorder }]} />
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
      <Ionicons name="chevron-back" size={22} color={ink} />
      <Type role="caption" color={ink} numberOfLines={1} style={styles.backLabel}>
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
      <Ionicons name={icon} size={21} color={palette.ink} />
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
    paddingHorizontal: spacing.sm,
  },
  side: {
    minWidth: 76,
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
    fontSize: 12,
    lineHeight: 15,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
    paddingRight: spacing.sm,
    marginLeft: -2,
  },
  backLabel: {
    fontWeight: '600',
    maxWidth: 60,
  },
  action: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  below: {
    paddingHorizontal: spacing.md,
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
