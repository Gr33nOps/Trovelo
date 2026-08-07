import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Button } from './Button';
import { Type } from './Type';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: Props) {
  const { palette } = useTheme();

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View
        style={[
          styles.medallion,
          {
            borderRadius: radii.pill,
            backgroundColor: withAlpha(palette.accent, 0.12),
            borderColor: withAlpha(palette.accent, 0.35),
          },
        ]}
      >
        <Ionicons name={icon} size={34} color={palette.accent} />
      </View>
      <Type role="heading" align="center" pressed>
        {title}
      </Type>
      {subtitle ? (
        <Type role="caption" align="center" style={styles.subtitle}>
          {subtitle}
        </Type>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <Button label={actionLabel} onPress={onAction} variant="primary" size="md" haptic="medium" />
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} onPress={onSecondary} variant="plain" size="md" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  medallion: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xs,
  },
  subtitle: {
    maxWidth: 320,
    lineHeight: 21,
  },
  actions: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});
