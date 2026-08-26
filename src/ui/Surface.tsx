import React, { ReactNode, memo } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  ElevationLevel,
  Gradient,
  TEXTURES,
  TextureName,
  elevation,
  radius as radii,
} from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

/**
 * A repeating texture tile laid over a surface. Rendered `pointerEvents="none"`
 * so it never intercepts touches, and memoised because the tile never changes.
 */
export const Texture = memo(function Texture({
  name,
  opacity,
  borderRadius,
}: {
  name: TextureName;
  opacity: number;
  borderRadius?: number;
}) {
  if (opacity <= 0) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]}
    >
      <Image
        source={TEXTURES[name]}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity }]}
      />
    </View>
  );
});

interface GradientSurfaceProps {
  readonly gradient: Gradient;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}

function GradientSurface({ gradient, style, children }: GradientSurfaceProps) {
  return (
    <LinearGradient
      colors={gradient.colors}
      locations={gradient.locations}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

/** The linen desk that sits behind every screen. */
export function Backdrop({
  style,
  children,
}: {
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
}) {
  const { palette } = useTheme();
  return (
    <GradientSurface gradient={palette.backdropGradient} style={[styles.fill, style]}>
      <Texture name="linen" opacity={palette.backdropTextureOpacity} />
      {children}
    </GradientSurface>
  );
}

export interface PanelProps {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** Inner padding shortcut; omit and pass your own padding via `style`. */
  readonly padded?: boolean;
  readonly level?: ElevationLevel;
  readonly borderRadius?: number;
  readonly texture?: TextureName | 'none';
  /** Tints the whole panel. Used for the accent-coloured hero card. */
  readonly gradient?: Gradient;
  readonly borderColor?: string;
}

/** A flat card: solid fill and a thin border. Shadow only at 'floating'/'modal' levels. */
export function Panel({
  children,
  style,
  padded = false,
  level = 'raised',
  borderRadius = radii.lg,
  texture = 'paper',
  gradient,
  borderColor,
}: PanelProps) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.panel,
        elevation(palette, level),
        {
          borderRadius,
          borderColor: borderColor ?? palette.edge,
          backgroundColor: palette.panel,
        },
        padded && styles.panelPadding,
        style,
      ]}
    >
      <GradientSurface
        gradient={gradient ?? palette.panelGradient}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      {texture !== 'none' ? (
        <Texture name={texture} opacity={palette.panelTextureOpacity} borderRadius={borderRadius} />
      ) : null}
      {children}
    </View>
  );
}

/**
 * A recessed well, the inverse of a Panel. Used for inputs, progress tracks
 * and anything that should read as carved into the surface.
 */
export function Well({
  children,
  style,
  borderRadius = radii.md,
}: {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly borderRadius?: number;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.well,
        { borderRadius, borderColor: palette.edgeStrong, backgroundColor: palette.well },
        style,
      ]}
    >
      <GradientSurface
        gradient={palette.wellGradient}
        style={[StyleSheet.absoluteFill, { borderRadius }]}
      />
      {children}
    </View>
  );
}

/** A single flat hairline divider. */
export function Rule({ style, inset = 0 }: { readonly style?: StyleProp<ViewStyle>; readonly inset?: number }) {
  const { palette } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[{ height: StyleSheet.hairlineWidth, marginLeft: inset, backgroundColor: palette.edge }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  panelPadding: {
    padding: 16,
  },
  well: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
