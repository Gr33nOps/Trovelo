import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { radius as radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { IconButton } from '../ui/Controls';
import { Panel } from '../ui/Surface';
import { Type } from '../ui/Type';
import { formatDate, formatRelativeDay } from '../utils/date';
import { displayTag } from '../utils/tags';
import { StatusBadge } from './StatusBadge';

interface Props {
  entry: Entry;
  folderName?: string;
  onToggleFavorite: () => void;
  onTagPress?: (tag: string) => void;
}

/**
 * The card that flips up when an entry is rediscovered.
 *
 * The entrance animation is keyed on the entry id so tapping "Another one"
 * replays it. The small physical beat is most of what makes the feature feel
 * like opening a box rather than paging a list.
 */
export function SurpriseCard({ entry, folderName, onToggleFavorite }: Props) {
  const { palette } = useTheme();
  const reveal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry.id, reveal]);

  const seenLabel =
    entry.timesRediscovered > 1
      ? `Rediscovered ${entry.timesRediscovered} times`
      : 'First time back';

  return (
    <Animated.View
      style={{
        opacity: reveal,
        transform: [
          { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
          { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      }}
    >
      <Panel style={styles.card} borderRadius={radii.xl} level="floating">
        <View style={styles.headerRow}>
          <View style={styles.headerMeta}>
            <Type role="label" pressed>
              Saved {formatRelativeDay(entry.createdAt)}
            </Type>
            <Type role="caption" color={palette.inkFaint} style={styles.exactDate}>
              {formatDate(entry.createdAt)}
              {folderName ? ` · ${folderName}` : ''}
            </Type>
          </View>
          <IconButton
            icon={entry.isFavorite ? 'star' : 'star-outline'}
            label={entry.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            color={entry.isFavorite ? palette.accent : palette.inkFaint}
            active={entry.isFavorite}
            size={22}
            onPress={onToggleFavorite}
          />
        </View>

        {entry.title ? (
          <Type role="title" pressed style={styles.title}>
            {entry.title}
          </Type>
        ) : null}

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          <Type role="body" style={styles.body}>
            {entry.text}
          </Type>
        </ScrollView>

        {entry.tags.length > 0 ? (
          <View style={styles.tags}>
            {entry.tags.map((tag) => (
              <Type key={tag} role="caption" color={palette.accent} style={styles.tag}>
                #{displayTag(tag)}
              </Type>
            ))}
          </View>
        ) : null}

        <View style={[styles.footer, { borderTopColor: palette.edge }]}>
          <View style={styles.seen}>
            <Ionicons name="refresh-outline" size={13} color={palette.inkFaint} />
            <Type role="caption" color={palette.inkFaint} style={styles.seenLabel}>
              {seenLabel}
            </Type>
          </View>
          <StatusBadge status={entry.status} />
        </View>
      </Panel>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerMeta: {
    flex: 1,
    gap: 2,
  },
  exactDate: {
    fontSize: 12,
  },
  title: {
    marginTop: -spacing.xs,
  },
  bodyScroll: {
    maxHeight: 260,
  },
  bodyContent: {
    paddingRight: spacing.xs,
  },
  body: {
    lineHeight: 26,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  seen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  seenLabel: {
    fontSize: 12,
  },
});
