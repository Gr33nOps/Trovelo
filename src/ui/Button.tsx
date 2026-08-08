import React, { useCallback, useRef } from 'react';
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

import {
  MIN_TOUCH,
  Palette,
  contrastingInk,
  fontSizes,
  fonts,
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
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  haptic?: 'light' | 'medium' | 'success' | 'warning' | false;
  tint?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 52 };
const FONT: Record<ButtonSize, number> = { sm: fontSizes.sm, md: fontSizes.md, lg: fontSizes.md };

interface Skin {
  fill: string;
  ink: string;
  border: string;
  bordered: boolean;
}

function skinFor(variant: ButtonVariant, palette: Palette, tint?: string): Skin {
  if (tint) {
    return { fill: tint, ink: contrastingInk(tint), border: tint, bordered: true };
  }
  switch (variant) {
    case 'primary':
      return { fill: palette.accent, ink: palette.accentInk, border: palette.accent, bordered: false };
    case 'danger':
      return { fill: palette.danger, ink: contrastingInk(palette.danger), border: palette.danger, bordered: false };
    case 'secondary':
      return { fill: palette.well, ink: palette.ink, border: palette.edge, bordered: true };
    case 'outline':
      return { fill: 'transparent', ink: palette.accent, border: palette.accent, bordered: true };
    case 'plain':
      return { fill: 'transparent', ink: palette.accent, border: 'transparent', bordered: false };
  }
}

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

  return (
    <Animated.View
      style={[
        fullWidth ? styles.fullWidth : null,
        {
          transform: [{ scale: travel.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }],
        },
        style,
      ]}
    >
      <Pressable
        onPress={() => {
          if (inert) return;
          if (haptic) haptics[haptic]();
          onPress();
        }}
        onLongPress={inert ? undefined : onLongPress}
        onPressIn={() => !inert && animate(1)}
        onPressOut={() => animate(0)}
        disabled={inert}
        hitSlop={size === 'sm' ? 4 : undefined}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inert, busy: loading }}
        style={[
          styles.base,
          {
            height,
            borderRadius: radii.sm,
            backgroundColor: skin.fill,
            borderWidth: skin.bordered ? 1.5 : 0,
            borderColor: disabled ? palette.edge : skin.border,
            opacity: disabled ? 0.45 : 1,
            minWidth: size === 'sm' ? undefined : MIN_TOUCH,
          },
        ]}
      >
        <View style={styles.content}>
          {loading ? <ActivityIndicator color={skin.ink} size="small" /> : icon}
          <Type
            role="body"
            color={skin.ink}
            numberOfLines={1}
            style={{
              fontFamily: fonts.bodySemibold,
              fontSize: FONT[size],
              fontWeight: weights.semibold,
              lineHeight: undefined,
              letterSpacing: variant === 'outline' ? 1.2 : 0,
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
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
