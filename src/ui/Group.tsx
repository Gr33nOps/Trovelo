import React, { Children, Fragment, ReactNode, isValidElement } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MIN_TOUCH, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Rule } from './Surface';
import { Type } from './Type';

export function SectionHeader({
  title,
  hint,
  action,
  style,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionHeaderMain}>
        <Type role="label" accessibilityRole="header">
          {title}
        </Type>
        {hint ? (
          <Type role="caption" style={styles.sectionHint}>
            {hint}
          </Type>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Flat grouped list — hairlines only, no card chrome. */
export function Group({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: number;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View style={style}>
      {items.map((child, index) => (
        <Fragment key={child.key ?? index}>
          {index > 0 ? <Rule /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  value?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

export function Row({
  title,
  subtitle,
  value,
  left,
  right,
  onPress,
  onLongPress,
  chevron,
  destructive = false,
  disabled = false,
  accessibilityHint,
  testID,
}: RowProps) {
  const { palette } = useTheme();
  const pressable = !!onPress && !disabled;
  const showChevron = chevron ?? (pressable && !right);
  const titleColor = destructive ? palette.danger : palette.ink;

  const body = (
    <View style={styles.row}>
      {left ? <View style={styles.rowLeft}>{left}</View> : null}
      <View style={styles.rowMain}>
        <Type role="bodyStrong" color={disabled ? palette.inkFaint : titleColor} numberOfLines={2}>
          {title}
        </Type>
        {subtitle ? (
          <Type role="caption" numberOfLines={3} color={palette.inkSoft}>
            {subtitle}
          </Type>
        ) : null}
      </View>
      {value ? (
        <Type role="caption" color={palette.inkFaint} numberOfLines={1} style={styles.rowValue}>
          {value}
        </Type>
      ) : null}
      {right}
      {showChevron ? <Ionicons name="chevron-forward" size={16} color={palette.inkFaint} /> : null}
    </View>
  );

  if (!pressable) {
    return (
      <View testID={testID} accessible={!onPress}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      android_ripple={{ color: palette.bevelBottom }}
      style={({ pressed }) => (pressed ? { opacity: 0.55 } : null)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionHeaderMain: {
    flex: 1,
    gap: 4,
  },
  sectionHint: {
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + 8,
    paddingVertical: spacing.md,
  },
  rowLeft: {
    width: 28,
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowValue: {
    maxWidth: '40%',
  },
});
