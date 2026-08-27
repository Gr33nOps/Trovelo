import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { STATUS_CONFIG, STATUS_ORDER, StatusTone } from '../constants/status';
import { Palette, radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { EntryStatus } from '../types';
import { Type } from '../ui/Type';

interface Props {
  readonly value: EntryStatus;
  readonly onChange: (status: EntryStatus) => void;
  /** Hides the "New" option, which is only ever an initial state. */
  readonly hideNew?: boolean;
}

interface ToneSkin {
  fill: string;
  border: string;
  ink: string;
  bold: boolean;
}

/**
 * Each status carries a different amount of visual weight so Done, Keep and
 * Pass don't read as three equally-important buttons: Done settles into a
 * solid neutral fill (a decision made), Keep borrows the accent the way an
 * outline button does (a highlighted choice), Pass stays close to plain text
 * (the lightest touch). None of this introduces a second colour — every tone
 * is built from the same ink/accent tokens the rest of the app uses.
 */
function skinForTone(tone: StatusTone, palette: Palette, active: boolean): ToneSkin {
  if (active) {
    return { fill: palette.accentSoftStrong, border: withAlpha(palette.accent, 0.5), ink: palette.accent, bold: true };
  }
  switch (tone) {
    case 'strong':
      return { fill: palette.well, border: withAlpha(palette.ink, 0.22), ink: palette.ink, bold: true };
    case 'accent':
      return { fill: palette.accentSoft, border: withAlpha(palette.accent, 0.35), ink: palette.accent, bold: false };
    case 'muted':
      return { fill: 'transparent', border: 'transparent', ink: palette.inkFaint, bold: false };
    case 'neutral':
    default:
      return { fill: 'transparent', border: palette.edge, ink: palette.inkSoft, bold: false };
  }
}

export function StatusPicker({ value, onChange, hideNew = false }: Props) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const options = hideNew ? STATUS_ORDER.filter((status) => status !== 'new') : STATUS_ORDER;

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((status) => {
        const config = STATUS_CONFIG[status];
        const active = status === value;
        const skin = skinForTone(config.tone, palette, active);
        return (
          <Pressable
            key={status}
            onPress={() => {
              haptics.light();
              onChange(status);
            }}
            hitSlop={6}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={config.shortLabel}
            accessibilityHint={config.hint}
            style={({ pressed }) => [
              styles.chip,
              {
                borderRadius: radii.sm,
                backgroundColor: skin.fill,
                borderColor: skin.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons name={config.icon} size={13} color={skin.ink} />
            <Type role="caption" color={skin.ink} style={[styles.label, skin.bold && styles.labelBold]}>
              {config.shortLabel}
            </Type>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontWeight: '500',
    fontSize: 14,
  },
  labelBold: {
    fontWeight: '700',
  },
});
