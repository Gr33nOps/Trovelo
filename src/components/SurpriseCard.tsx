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

/** Calm surprise reading surface — kind, body, date. Nothing else. */
export function SurpriseCard({ entry, folderName, onToggleFavorite }: Props) {
  const { palette } = useTheme();
  const reveal = useRef(new Animated.Value(0)).current;
  const kind = entry.kind ?? 'idea';
  const body = entry.title?.trim() ? `${entry.title.trim()}\n\n${entry.text}` : entry.text;

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entry.id, reveal]);

  return (
    <Animated.View
      style={{
        opacity: reveal,
        transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View style={styles.wrap}>
        <View style={styles.top}>
          <Type role="label" color={palette.inkFaint}>
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

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <Type role="title" style={styles.body}>
            {body}
          </Type>
        </ScrollView>

        <Type role="caption" color={palette.inkFaint}>
          {formatDate(entry.createdAt)}
          {folderName ? ` · ${folderName}` : ''}
        </Type>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xl,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scroll: {
    maxHeight: 360,
  },
  body: {
    fontFamily: fonts.displayRegular,
    fontWeight: weights.regular,
    fontSize: fontSizes.xl,
    lineHeight: 36,
    letterSpacing: -0.3,
  },
});
