import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { KIND_CONFIG } from '../constants/kinds';
import { HIT_SLOP, fonts, fontSizes, spacing, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { formatDueLabel, formatShortRelative } from '../utils/date';
import { Type } from '../ui/Type';

interface Props {
  entry: Entry;
  folderName?: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** Shown as a checkbox for tasks. Omit to hide the checkbox entirely. */
  onToggleDone?: () => void;
}

/**
 * Editorial list row: kind + relative time on top, body below, hairline below.
 * No card chrome — the list itself is the surface.
 */
export const EntryCard = memo(
  function EntryCard({ entry, folderName, onPress, onLongPress, onToggleDone }: Props) {
    const { palette } = useTheme();
    const preview = entry.text.trim();
    const kind = entry.kind ?? 'idea';
    const isTask = kind === 'task';
    const done = entry.status === 'done';
    const overdue = isTask && !done && !!entry.dueAt && entry.dueAt < Date.now();
    const display = entry.title ? `${entry.title} — ${preview}` : preview;

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={entry.title ?? preview.slice(0, 80)}
        accessibilityHint="Opens this entry"
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.meta}>
          <View style={styles.metaLeft}>
            {isTask ? (
              <Pressable
                onPress={onToggleDone}
                hitSlop={HIT_SLOP}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={done ? 'Mark task not done' : 'Mark task done'}
                style={styles.checkbox}
              >
                <Ionicons
                  name={done ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={done ? palette.accent : palette.inkFaint}
                />
              </Pressable>
            ) : null}
            <Type role="label" color={palette.inkFaint} style={styles.kind}>
              {KIND_CONFIG[kind].label}
            </Type>
            {entry.isPinned ? <Ionicons name="bookmark" size={14} color={palette.accent} /> : null}
            {entry.isFavorite ? <Ionicons name="star" size={14} color={palette.accent} /> : null}
          </View>
          <Type role="label" color={palette.inkFaint} style={styles.when}>
            {formatShortRelative(entry.createdAt)}
          </Type>
        </View>

        <Type
          role="body"
          numberOfLines={4}
          color={done ? palette.inkFaint : palette.ink}
          style={[styles.body, done && styles.doneText]}
        >
          {display}
        </Type>

        {isTask && entry.dueAt && !done ? (
          <Type role="caption" color={overdue ? palette.danger : palette.inkFaint} style={styles.due}>
            {formatDueLabel(entry.dueAt)}
            {folderName ? ` · ${folderName}` : ''}
          </Type>
        ) : folderName ? (
          <Type role="caption" color={palette.inkFaint} style={styles.due}>
            {folderName}
          </Type>
        ) : null}
      </Pressable>
    );
  },
  (prev, next) =>
    prev.entry.id === next.entry.id &&
    prev.entry.title === next.entry.title &&
    prev.entry.text === next.entry.text &&
    prev.entry.status === next.entry.status &&
    prev.entry.isFavorite === next.entry.isFavorite &&
    prev.entry.isPinned === next.entry.isPinned &&
    prev.entry.kind === next.entry.kind &&
    prev.entry.dueAt === next.entry.dueAt &&
    prev.entry.createdAt === next.entry.createdAt &&
    prev.entry.tags === next.entry.tags &&
    prev.folderName === next.folderName &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onToggleDone === next.onToggleDone,
);

const styles = StyleSheet.create({
  row: {
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  checkbox: {
    marginRight: 2,
  },
  kind: {
    letterSpacing: 1.4,
  },
  when: {
    letterSpacing: 0.8,
    textTransform: 'none',
    fontFamily: fonts.body,
    fontWeight: weights.regular,
    fontSize: fontSizes.xs,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    lineHeight: 28,
  },
  doneText: {
    textDecorationLine: 'line-through',
  },
  due: {
    marginTop: 2,
  },
});
