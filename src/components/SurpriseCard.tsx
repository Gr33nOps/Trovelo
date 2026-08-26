import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';

import { fonts, fontSizes, spacing, weights } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Entry } from '../types';
import { Type } from '../ui/Type';
import { formatDate } from '../utils/date';

interface Props {
  readonly entry: Entry;
  readonly folderName?: string;
}

/** Calm surprise reading surface — body and date. Nothing else. */
export function SurpriseCard({ entry, folderName }: Props) {
  const { palette } = useTheme();
  const reveal = useRef(new Animated.Value(0)).current;
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
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} nestedScrollEnabled>
          <Type role="title" style={styles.body}>
            {body}
          </Type>
        </ScrollView>

        <Type role="caption" color={palette.inkFaint} style={styles.meta}>
          {formatDate(entry.createdAt)}
          {folderName ? ` · ${folderName}` : ''}
        </Type>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
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
  meta: {
    marginTop: -spacing.xs,
  },
});
