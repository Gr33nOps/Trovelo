import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import {
  HIT_SLOP,
  MIN_TOUCH,
  radius as radii,
  spacing,
  withAlpha,
} from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Well } from './Surface';
import { Type } from './Type';

/* ------------------------------------------------------------------ Chip -- */

export interface ChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
  /** Fill colour when active. Ink is chosen automatically for contrast. */
  color?: string;
  icon?: ReactNode;
  count?: number;
  accessibilityHint?: string;
}

/** A small pressable filter tab. Sized to stay tappable despite its looks. */
export function Chip({ label, active = false, onPress, color, icon, count, accessibilityHint }: ChipProps) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const fill = color ?? palette.accent;
  const ink = active ? palette.accent : palette.inkSoft;

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      hitSlop={HIT_SLOP}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={count === undefined ? label : `${label}, ${count}`}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radii.sm,
          borderColor: active ? withAlpha(fill, 0.5) : palette.edge,
          backgroundColor: active ? withAlpha(fill, 0.12) : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      {icon}
      <Type role="caption" color={ink} style={styles.chipLabel}>
        {label}
      </Type>
      {count !== undefined ? (
        <Type role="caption" color={active ? ink : palette.inkFaint} style={styles.chipCount}>
          {count}
        </Type>
      ) : null}
    </Pressable>
  );
}

/** Underline text tab — equal height, aligned baseline, consistent gap. */
export function TextTab({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.textTab, { opacity: pressed ? 0.55 : 1 }]}
    >
      <Type
        role="body"
        color={active ? palette.ink : palette.inkFaint}
        style={[styles.textTabLabel, active && styles.textTabLabelActive]}
      >
        {label}
      </Type>
      <View style={[styles.textTabRule, { backgroundColor: active ? palette.ink : 'transparent' }]} />
    </Pressable>
  );
}

/* ----------------------------------------------------------- Segmented -- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

/** The classic inset segmented control: recessed track, raised active segment. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  accessibilityLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();

  return (
    <Well style={[styles.segment, style]} borderRadius={radii.md}>
      <View style={styles.segmentInner} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (active) return;
                haptics.light();
                onChange(option.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
              style={[styles.segmentItem, { borderRadius: radii.sm }]}
            >
              {active ? (
                <>
                  <LinearGradient
                    colors={palette.panelGradient.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: radii.sm }]}
                  />
                  <View
                    pointerEvents="none"
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        borderRadius: radii.sm,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: palette.edgeStrong,
                      },
                    ]}
                  />
                </>
              ) : null}
              {option.icon ? (
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={active ? palette.ink : palette.inkSoft}
                />
              ) : null}
              <Type
                role="caption"
                color={active ? palette.ink : palette.inkSoft}
                pressed={active}
                numberOfLines={1}
                style={active ? styles.segmentLabelActive : undefined}
              >
                {option.label}
              </Type>
            </Pressable>
          );
        })}
      </View>
    </Well>
  );
}

/* --------------------------------------------------------------- Badge -- */

export function Badge({ label, color, icon }: { label: string; color: string; icon?: ReactNode }) {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        {
          borderRadius: radii.pill,
          backgroundColor: withAlpha(color, palette.mood === 'dark' ? 0.22 : 0.16),
          borderColor: withAlpha(color, 0.45),
        },
      ]}
    >
      {icon}
      <Type role="caption" color={color} style={styles.badgeLabel}>
        {label}
      </Type>
    </View>
  );
}

/* ---------------------------------------------------------- ProgressBar -- */

/** A flat recessed track with a flat fill. No animation, no gloss. */
export function ProgressBar({
  fraction,
  label,
  indeterminate = false,
}: {
  fraction: number;
  label?: string;
  indeterminate?: boolean;
}) {
  const { palette } = useTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));

  return (
    <View style={styles.progressWrap}>
      <Well style={styles.progressTrack} borderRadius={radii.pill}>
        <View
          style={[
            styles.progressFill,
            {
              width: indeterminate ? '100%' : `${clamped * 100}%`,
              minWidth: indeterminate || clamped > 0 ? 10 : 0,
              backgroundColor: palette.accent,
              borderRadius: radii.pill,
              opacity: indeterminate ? 0.4 : 1,
            },
          ]}
          accessibilityRole="progressbar"
          accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: Math.round(clamped * 100) }}
        />
      </Well>
      {label ? (
        <Type role="caption" style={styles.progressLabel}>
          {label}
        </Type>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------- IconButton -- */

export function IconButton({
  icon,
  onPress,
  label,
  color,
  size = 20,
  active = false,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  active?: boolean;
  disabled?: boolean;
}) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const tint = disabled ? palette.inkFaint : color ?? (active ? palette.accent : palette.inkSoft);

  return (
    <Pressable
      onPress={() => {
        if (disabled) return;
        haptics.light();
        onPress();
      }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.55 : 1 }]}
    >
      <Ionicons name={icon} size={size} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  chipLabel: {
    fontWeight: '500',
    fontSize: 14,
  },
  chipCount: {
    fontVariant: ['tabular-nums'],
  },
  textTab: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginRight: spacing.xl,
    justifyContent: 'flex-end',
  },
  textTabLabel: {
    fontSize: 16,
    lineHeight: 22,
  },
  textTabLabelActive: {
    fontWeight: '600',
  },
  textTabRule: {
    marginTop: 8,
    height: 2,
    borderRadius: 1,
  },
  segment: {
    padding: 3,
  },
  segmentInner: {
    flexDirection: 'row',
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  segmentLabelActive: {
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    lineHeight: 15,
  },
  progressWrap: {
    gap: 6,
  },
  progressTrack: {
    height: 14,
    padding: 2,
    justifyContent: 'center',
  },
  progressFill: {
    height: '100%',
    overflow: 'hidden',
  },
  progressLabel: {
    fontVariant: ['tabular-nums'],
  },
  iconButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
