import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { KIND_CONFIG } from '../constants/kinds';
import { HIT_SLOP, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { formatDueLabel, formatShortRelative } from '../utils/date';
import { Type } from '../ui/Type';

interface Props {
  entry: Entry;
  folderName?: string;
  onPress: () => void;
  onLongPress?: () => void;
  onToggleDone?: () => void;
}

/** Flat list row — meta on one line, body below. No card chrome. */
export const EntryCard = memo(
  function EntryCard({ entry, folderName, onPress, onLongPress, onToggleDone }: Props) {
    const { palette } = useTheme();
    const preview = entry.text.trim();
    const kind = entry.kind ?? 'idea';
    const isTask = kind === 'task';
    const done = entry.status === 'done';
    const overdue = isTask && !done && !!entry.dueAt && entry.dueAt < Date.now();
    const display = entry.title?.trim() || preview;

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={display.slice(0, 80)}
        accessibilityHint="Opens this entry"
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.55 }]}
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
              >
                <Ionicons
                  name={done ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={done ? palette.accent : palette.inkFaint}
                />
              </Pressable>
            ) : null}
            <Type role="label" color={palette.inkFaint}>
              {KIND_CONFIG[kind].label}
            </Type>
            {entry.isPinned ? <Ionicons name="bookmark" size={13} color={palette.accent} /> : null}
            {entry.isFavorite ? <Ionicons name="star" size={13} color={palette.accent} /> : null}
          </View>
          <Type role="caption" color={palette.inkFaint}>
            {formatShortRelative(entry.createdAt)}
          </Type>
        </View>

        <Type
          role="body"
          numberOfLines={3}
          color={done ? palette.inkFaint : palette.ink}
          style={done ? styles.done : undefined}
        >
          {display}
        </Type>

        {entry.title && preview && entry.title.trim() !== preview ? (
          <Type role="caption" numberOfLines={2} color={palette.inkSoft}>
            {preview}
          </Type>
        ) : null}

        {isTask && entry.dueAt && !done ? (
          <Type role="caption" color={overdue ? palette.danger : palette.inkFaint}>
            {formatDueLabel(entry.dueAt)}
            {folderName ? ` · ${folderName}` : ''}
          </Type>
        ) : folderName ? (
          <Type role="caption" color={palette.inkFaint}>
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
  done: {
    textDecorationLine: 'line-through',
  },
});
