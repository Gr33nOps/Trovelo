import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { formatShortDate, formatShortRelative } from '../utils/date';
import { Type } from '../ui/Type';

interface Props {
  readonly entry: Entry;
  readonly folderName?: string;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  /** Changes at local midnight so relative dates refresh. */
  readonly dayVersion?: string;
}

/** Flat list row — meta on one line, body below. No card chrome. */
export const EntryCard = memo(
  function EntryCard({ entry, folderName, onPress, onLongPress }: Props) {
    const { palette } = useTheme();
    const preview = entry.text.trim();
    const done = entry.status === 'done';
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
        <View style={styles.main}>
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

          <View style={styles.meta}>
            {entry.isPinned ? <Ionicons name="bookmark" size={12} color={palette.accent} /> : null}
            {entry.isFavorite ? <Ionicons name="star" size={12} color={palette.accent} /> : null}
            <Type role="caption" color={palette.inkSoft}>
              {formatShortDate(entry.createdAt)} · {formatShortRelative(entry.createdAt)}
              {folderName ? ` · ${folderName}` : ''}
            </Type>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={16} color={palette.inkFaint} style={styles.chevron} />
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
    prev.entry.createdAt === next.entry.createdAt &&
    prev.entry.tags === next.entry.tags &&
    prev.folderName === next.folderName &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.dayVersion === next.dayVersion,
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  main: {
    flex: 1,
    gap: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chevron: {
    marginLeft: spacing.xs,
  },
  done: {
    textDecorationLine: 'line-through',
  },
});
