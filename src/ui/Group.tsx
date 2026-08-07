import React, { Children, Fragment, ReactNode, isValidElement } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MIN_TOUCH, radius as radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Panel, Rule } from './Surface';
import { Type } from './Type';

/** Small muted heading above a group, with an optional hint and action. */
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
        <Type role="label" pressed accessibilityRole="header">
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

/**
 * A grouped list: one card, hairline rules between children, rounded ends.
 * Children are separated automatically so callers never hand-place dividers.
 */
/** A grouped list with soft hairlines between children. */
export function Group({
  children,
  style,
  inset = spacing.lg,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  inset?: number;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <Panel style={style} borderRadius={radii.lg} borderColor="transparent">
      {items.map((child, index) => (
        <Fragment key={child.key ?? index}>
          {index > 0 ? <Rule inset={inset} /> : null}
          {child}
        </Fragment>
      ))}
    </Panel>
  );
}

export interface RowProps {
  title: string;
  subtitle?: string;
  /** Right-hand value text, e.g. a count or current setting. */
  value?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Shows a chevron; defaults to true when the row is pressable. */
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** A single line in a {@link Group}. Meets the 44pt minimum touch target. */
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
        <Type role="bodyStrong" color={disabled ? palette.inkFaint : titleColor} pressed numberOfLines={2}>
          {title}
        </Type>
        {subtitle ? (
          <Type role="caption" numberOfLines={3}>
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
      {showChevron ? (
        <Ionicons name="chevron-forward" size={16} color={palette.inkFaint} style={styles.chevron} />
      ) : null}
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
      style={({ pressed }) => (pressed ? { backgroundColor: palette.bevelBottom } : null)}
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
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  sectionHeaderMain: {
    flex: 1,
    gap: 2,
  },
  sectionHint: {
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowLeft: {
    width: 32,
    alignItems: 'center',
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowValue: {
    maxWidth: '40%',
  },
  chevron: {
    marginLeft: -4,
  },
});
