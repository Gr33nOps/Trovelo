import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { spacing } from '../constants/theme';
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

/** Minimal empty state — optional icon, title, subtitle and focused actions. */
export function EmptyState({
  icon,
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
      {icon ? <Ionicons name={icon} size={30} color={palette.inkFaint} accessibilityElementsHidden /> : null}
      <Type role="heading" align="center">
        {title}
      </Type>
      {subtitle ? (
        <Type role="caption" align="center" color={palette.inkSoft} style={styles.subtitle}>
          {subtitle}
        </Type>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="outline" size="md" style={styles.action} />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button label={secondaryLabel} onPress={onSecondary} variant="plain" size="sm" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  subtitle: {
    maxWidth: 280,
    lineHeight: 22,
  },
  action: {
    marginTop: spacing.sm,
    minWidth: 140,
  },
});
