import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { STATUS_CONFIG, STATUS_ORDER } from '../constants/status';
import { contrastingInk, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { EntryStatus } from '../types';
import { Chip } from '../ui/Controls';

interface Props {
  value: EntryStatus;
  onChange: (status: EntryStatus) => void;
  /** Hides the "New" option, which is only ever an initial state. */
  hideNew?: boolean;
}

export function StatusPicker({ value, onChange, hideNew = false }: Props) {
  const { palette } = useTheme();
  const options = hideNew ? STATUS_ORDER.filter((status) => status !== 'new') : STATUS_ORDER;

  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((status) => {
        const config = STATUS_CONFIG[status];
        const color = palette.accent;
        const active = status === value;
        return (
          <Chip
            key={status}
            label={config.shortLabel}
            active={active}
            color={color}
            onPress={() => onChange(status)}
            accessibilityHint={config.hint}
            icon={
              <Ionicons
                name={config.icon}
                size={13}
                color={active ? contrastingInk(color) : color}
              />
            }
          />
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
});
