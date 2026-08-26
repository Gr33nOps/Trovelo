import React, { Children, Fragment, ReactNode, isValidElement } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MIN_TOUCH, radius as radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Panel, Rule } from './Surface';
import { Type } from './Type';

export function SectionHeader({
  title,
  hint,
  action,
  style,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly action?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
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

/** A bordered card of rows, hairlines between them — gives each settings section a clear boundary. */
export function Group({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <Panel style={[styles.group, style]} borderRadius={radii.lg}>
      {items.map((child, index) => (
        <Fragment key={child.key ?? index}>
          {index > 0 ? <Rule /> : null}
          {child}
        </Fragment>
      ))}
    </Panel>
  );
}

function RowBody({
  title,
  subtitle,
  value,
  left,
  right,
  disabled,
  titleColor,
  showChevron,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly value?: string;
  readonly left?: ReactNode;
  readonly right?: ReactNode;
  readonly disabled: boolean;
  readonly titleColor: string;
  readonly showChevron: boolean;
}) {
  const { palette } = useTheme();
  return (
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
}

export interface RowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly value?: string;
  readonly left?: ReactNode;
  readonly right?: ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly chevron?: boolean;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
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
  const interactive = Boolean(onPress);
  const pressable = interactive && !disabled;
  const showChevron = chevron ?? (pressable && !right);
  const titleColor = destructive ? palette.danger : palette.ink;
  const accessibilityLabel = subtitle ? `${title}. ${subtitle}` : title;

  const body = (
    <RowBody
      title={title}
      subtitle={subtitle}
      value={value}
      left={left}
      right={right}
      disabled={disabled}
      titleColor={titleColor}
      showChevron={showChevron}
    />
  );

  if (pressable) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        android_ripple={{ color: palette.bevelBottom }}
        style={({ pressed }) => (pressed ? { opacity: 0.55 } : null)}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      accessible={interactive || !right}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityLabel={interactive ? accessibilityLabel : undefined}
      accessibilityHint={interactive ? accessibilityHint : undefined}
      accessibilityState={interactive ? { disabled } : undefined}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    paddingHorizontal: spacing.lg,
  },
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
