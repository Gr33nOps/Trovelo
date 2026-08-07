import React, { ReactNode, useCallback, useRef } from 'react';
import {
  AccessibilityProps,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  Gradient,
  MIN_TOUCH,
  Palette,
  contrastingInk,
  fontSizes,
  radius as radii,
  weights,
} from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Type } from './Type';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'plain' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Pick<AccessibilityProps, 'accessibilityHint'> {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  haptic?: 'light' | 'medium' | 'success' | 'warning' | false;
  /** Overrides the variant's fill. Used for status-coloured actions. */
  tint?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 56 };
const FONT: Record<ButtonSize, number> = { sm: fontSizes.sm, md: fontSizes.md, lg: fontSizes.lg };

/** A flat fill: both gradient stops are the tint itself. */
function tintGradient(tint: string): Gradient {
  return { colors: [tint, tint] };
}

function shiftChannel(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const parts = [0, 2, 4].map((i) => {
    const channel = parseInt(full.slice(i, i + 2), 16);
    const next = amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)))
      .toString(16)
      .padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

const darken = (hex: string, amount: number) => shiftChannel(hex, -amount);

interface Skin {
  gradient: Gradient;
  ink: string;
  border: string;
  bordered: boolean;
}

function skinFor(variant: ButtonVariant, palette: Palette, tint?: string): Skin {
  if (tint) {
    return { gradient: tintGradient(tint), ink: contrastingInk(tint), border: darken(tint, 0.35), bordered: true };
  }
  switch (variant) {
    case 'primary':
      return {
        gradient: palette.accentGradient,
        ink: palette.accentInk,
        border: palette.accentEdge,
        bordered: true,
      };
    case 'danger':
      // Was a hardcoded near-white, which is nearly unreadable against the
      // dark-mode danger colour (a light salmon, luminance ~0.35). Deriving it
      // the same way `tint` does keeps both modes correct.
      return {
        gradient: palette.dangerGradient,
        ink: contrastingInk(palette.danger),
        border: palette.dangerEdge,
        bordered: true,
      };
    case 'secondary':
      return {
        gradient: palette.panelGradient,
        ink: palette.ink,
        border: palette.edgeStrong,
        bordered: true,
      };
    case 'outline':
      return {
        gradient: { colors: ['transparent', 'transparent'] },
        ink: palette.accent,
        border: palette.accent,
        bordered: true,
      };
    case 'plain':
      return {
        gradient: { colors: ['transparent', 'transparent'] },
        ink: palette.accent,
        border: 'transparent',
        bordered: false,
      };
  }
}

/**
 * A flat button: solid fill, a thin rim, and a small travel-and-darken
 * response when held down. No gradient, gloss or shadow.
 */
export function Button({
  label,
  onPress,
  onLongPress,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  disabled = false,
  loading = false,
  haptic = 'light',
  tint,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const travel = useRef(new Animated.Value(0)).current;

  const inert = disabled || loading;
  const skin = skinFor(variant, palette, disabled ? undefined : tint);
  const height = HEIGHTS[size];

  const animate = useCallback(
    (to: number) => {
      Animated.timing(travel, {
        toValue: to,
        duration: to === 1 ? 40 : 120,
        useNativeDriver: true,
      }).start();
    },
    [travel],
  );

  const handlePress = () => {
    if (inert) return;
    if (haptic) haptics[haptic]();
    onPress();
  };

  // Disabled state is conveyed by the 0.55 opacity below alone. Also
  // swapping the label to `inkFaint` stacked two dimming effects on the same
  // pixels; against the near-black dark-mode backdrop that combination
  // dropped well under 4.5:1 contrast, reading as barely-there grey text
  // rather than a legibly "disabled" label.
  const ink = skin.ink;

  return (
    <Animated.View
      style={[
        fullWidth ? styles.fullWidth : null,
        variant !== 'plain'
          ? { backgroundColor: skin.gradient.colors[1], borderRadius: radii.md }
          : null,
        { transform: [{ translateY: travel.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }] },
        style,
      ]}
    >
      <Pressable
        onPress={handlePress}
        onLongPress={inert ? undefined : onLongPress}
        onPressIn={() => !inert && animate(1)}
        onPressOut={() => animate(0)}
        disabled={inert}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inert, busy: loading }}
        style={[
          styles.base,
          {
            height,
            borderRadius: radii.md,
            borderWidth: skin.bordered ? (variant === 'outline' ? 1.5 : StyleSheet.hairlineWidth) : 0,
            borderColor: disabled ? palette.edge : skin.border,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
      >
        <LinearGradient
          colors={skin.gradient.colors}
          locations={skin.gradient.locations}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radii.md }]}
        />
        {/* Held-down state: the whole face darkens slightly. */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radii.md,
              backgroundColor: '#000',
              opacity: travel.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
            },
          ]}
        />

        {/*
          The spinner takes the icon's place rather than replacing the whole
          content. Swapping the label out left a running button blank, which
          read as broken and threw away the label callers set for exactly this
          state (AiPanel's "Rewriting…", for one).
        */}
        <View style={styles.content}>
          {loading ? <ActivityIndicator color={ink} size="small" /> : icon}
          <Type
            role="body"
            color={ink}
            pressed={variant !== 'plain'}
            onAccent={variant === 'primary' || variant === 'danger' || !!tint}
            numberOfLines={1}
            style={{
              fontSize: FONT[size],
              fontWeight: weights.semibold,
              lineHeight: undefined,
              letterSpacing: variant === 'outline' ? 1.5 : undefined,
            }}
          >
            {label}
          </Type>
          {loading ? null : iconRight}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    alignSelf: 'stretch',
  },
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
