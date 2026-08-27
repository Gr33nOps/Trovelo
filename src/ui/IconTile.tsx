import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { radius as radii, solidTint, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

interface Props {
  readonly icon: keyof typeof Ionicons.glyphMap;
  /** Defaults to the app accent. Pass `palette.danger` for a destructive row. */
  readonly tint?: string;
  readonly size?: number;
  readonly iconSize?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A small square behind an icon, used to anchor list rows and kind markers.
 *
 * Neutral by default — a faint ink wash and an inkSoft glyph — so rows stay
 * quiet. Pass `tint` for the one or two places that genuinely warrant colour
 * (a favourite, a destructive row, the home quick-add buttons).
 */
export function IconTile({ icon, tint, size = 38, iconSize, style }: Props) {
  const { palette } = useTheme();
  const color = tint ?? palette.inkSoft;
  const tinted = tint !== undefined;

  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          backgroundColor: tinted ? solidTint(color, palette, 'strong') : palette.well,
          borderColor: tinted ? withAlpha(color, 0.4) : 'transparent',
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.5)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
