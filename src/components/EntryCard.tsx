import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { KIND_CONFIG } from '../constants/kinds';
import { HIT_SLOP, radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { formatDueLabel, formatRelativeDay } from '../utils/date';
import { IconTile } from '../ui/IconTile';
import { Panel } from '../ui/Surface';
import { Type } from '../ui/Type';
import { displayTag } from '../utils/tags';
import { StatusBadge } from './StatusBadge';

interface Props {
  entry: Entry;
  folderName?: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** Shown as a checkbox for tasks. Omit to hide the checkbox entirely. */
  onToggleDone?: () => void;
}

/**
 * One index card in the library list.
 *
 * Memoised on the fields it actually draws: the list re-renders on every
 * change to any entry, and without this each keystroke in the search box
 * re-rendered every visible card.
 */
export const EntryCard = memo(
  function EntryCard({ entry, folderName, onPress, onLongPress, onToggleDone }: Props) {
    const { palette } = useTheme();
    const preview = entry.text.trim();
    const kind = entry.kind ?? 'idea';
    const isTask = kind === 'task';
    const done = entry.status === 'done';
    const overdue = isTask && !done && !!entry.dueAt && entry.dueAt < Date.now();

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={entry.title ?? preview.slice(0, 80)}
        accessibilityHint="Opens this entry"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <Panel style={styles.card} borderRadius={radii.lg}>
          <View style={styles.header}>
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
            ) : (
              <IconTile icon={KIND_CONFIG[kind].icon} size={34} iconSize={17} />
            )}
            <View style={styles.headerText}>
              {entry.title ? (
                <Type
                  role="bodyStrong"
                  numberOfLines={1}
                  pressed
                  style={done ? styles.doneText : undefined}
                  color={done ? palette.inkFaint : undefined}
                >
                  {entry.title}
                </Type>
              ) : null}
              <Type
                role={entry.title ? 'caption' : 'body'}
                numberOfLines={entry.title ? 2 : 3}
                color={done ? palette.inkFaint : entry.title ? palette.inkSoft : palette.ink}
                style={done ? styles.doneText : undefined}
              >
                {preview}
              </Type>
            </View>
            {entry.isPinned ? (
              <Ionicons name="bookmark" size={15} color={palette.accent} style={styles.star} />
            ) : null}
            {entry.isFavorite ? (
              <Ionicons
                name="star"
                size={16}
                color={palette.accent}
                accessibilityLabel="Favourite"
                style={styles.star}
              />
            ) : null}
            <Ionicons name="chevron-forward" size={15} color={palette.inkFaint} style={styles.chevron} />
          </View>

          {isTask && entry.dueAt && !done ? (
            <View
              style={[
                styles.dueBadge,
                {
                  borderRadius: radii.pill,
                  backgroundColor: withAlpha(overdue ? palette.danger : palette.accent, 0.14),
                },
              ]}
            >
              <Ionicons name="time-outline" size={12} color={overdue ? palette.danger : palette.accent} />
              <Type role="caption" color={overdue ? palette.danger : palette.accent} style={styles.dueLabel}>
                {formatDueLabel(entry.dueAt)}
              </Type>
            </View>
          ) : null}

          {entry.tags.length > 0 ? (
            <View style={styles.tags}>
              {entry.tags.slice(0, 3).map((tag) => (
                <Type key={tag} role="caption" color={palette.inkFaint} style={styles.tag}>
                  #{displayTag(tag)}
                </Type>
              ))}
              {entry.tags.length > 3 ? (
                <Type role="caption" color={palette.inkFaint} style={styles.tag}>
                  +{entry.tags.length - 3}
                </Type>
              ) : null}
            </View>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.meta}>
              <Type role="caption" color={palette.inkFaint} style={styles.date}>
                {formatRelativeDay(entry.createdAt)}
              </Type>
              {folderName ? (
                <>
                  <Type role="caption" color={palette.inkFaint} style={styles.dot}>
                    ·
                  </Type>
                  <Type role="caption" color={palette.inkFaint} numberOfLines={1} style={styles.folder}>
                    {folderName}
                  </Type>
                </>
              ) : null}
            </View>
            <StatusBadge status={entry.status} compact />
          </View>
        </Panel>
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
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: 2,
    paddingTop: 2,
  },
  star: {
    marginTop: 2,
  },
  chevron: {
    marginTop: 3,
  },
  checkbox: {
    marginTop: 1,
  },
  doneText: {
    textDecorationLine: 'line-through',
  },
  dueBadge: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  dueLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  meta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  date: {
    fontSize: 12,
  },
  dot: {
    fontSize: 12,
  },
  folder: {
    fontSize: 12,
    flexShrink: 1,
  },
});
