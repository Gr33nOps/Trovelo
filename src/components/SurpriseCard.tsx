import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';

import { KIND_CONFIG } from '../constants/kinds';
import { fonts, fontSizes, spacing, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { IconButton } from '../ui/Controls';
import { Type } from '../ui/Type';
import { formatDate } from '../utils/date';

interface Props {
  entry: Entry;
  folderName?: string;
  onToggleFavorite: () => void;
  onTagPress?: (tag: string) => void;
}

/**
 * Editorial surprise reveal: kind label, large serif body, date underneath.
 * Matches the calm reading layout from the reference — no floating card chrome.
 */
export function SurpriseCard({ entry, folderName, onToggleFavorite }: Props) {
  const { palette } = useTheme();
  const reveal = useRef(new Animated.Value(0)).current;
  const kind = entry.kind ?? 'idea';
  const body = entry.title ? `${entry.title} — ${entry.text}` : entry.text;

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry.id, reveal]);

  return (
    <Animated.View
      style={{
        opacity: reveal,
        transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
      }}
    >
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Type role="label" color={palette.inkFaint} style={styles.kind}>
            {KIND_CONFIG[kind].label}
          </Type>
          <IconButton
            icon={entry.isFavorite ? 'star' : 'star-outline'}
            label={entry.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            color={entry.isFavorite ? palette.accent : palette.inkFaint}
            active={entry.isFavorite}
            size={22}
            onPress={onToggleFavorite}
          />
        </View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Type role="title" style={styles.body}>
            {body}
          </Type>
        </ScrollView>

        <Type role="caption" color={palette.inkFaint} style={styles.date}>
          {formatDate(entry.createdAt)}
          {folderName ? ` · ${folderName}` : ''}
        </Type>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kind: {
    letterSpacing: 1.6,
  },
  bodyScroll: {
    maxHeight: 340,
  },
  bodyContent: {
    paddingRight: spacing.xs,
  },
  body: {
    fontFamily: fonts.displayRegular,
    fontWeight: weights.regular,
    fontSize: fontSizes.xl,
    lineHeight: 38,
  },
  date: {
    fontSize: fontSizes.sm,
  },
});
