import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '../context/ThemeContext';

const MARK = require('../../assets/logo-mark.png');

interface Props {
  /** Tile edge length. The mark itself is inset within it. */
  size?: number;
  /** Overrides the live theme's accent, e.g. for previewing a choice that isn't selected yet. */
  accentColor?: string;
  /** Overrides the live theme's backdrop. */
  background?: string;
  borderColor?: string;
}

/**
 * The Trovelo mark, live-themed by default: the tile background follows
 * light/dark mode and the mark itself is tinted with whichever accent colour
 * is currently selected. Unlike the launcher icon (a fixed file the OS reads
 * once at install, with no way to watch app state), everything shown inside
 * the app can track these settings for real. `accentColor`/`background` let
 * a caller render a fixed preview instead, e.g. an option in a picker.
 */
export function AppMark({ size = 72, accentColor, background, borderColor }: Props) {
  const { palette } = useTheme();

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          backgroundColor: background ?? palette.backdrop,
          borderColor: borderColor ?? palette.edge,
        },
      ]}
    >
      <Image
        source={MARK}
        resizeMode="contain"
        style={{ width: size * 0.62, height: size * 0.62, tintColor: accentColor ?? palette.accent }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
