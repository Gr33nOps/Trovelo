import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PAGE_PAD, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation';
import { Button } from '../ui/Button';
import { Backdrop } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const PAGES = [
  {
    title: 'One place for everything',
    body: 'Ideas, notes, tasks and journal entries live in the same box.',
  },
  {
    title: 'Rediscover what you saved',
    body: 'Tap Surprise Me and something comes back when you least expect it.',
  },
  {
    title: 'A quiet helper',
    body: 'An optional assistant can tidy wording and suggest tags — on this phone by default.',
  },
  {
    title: 'Yours alone',
    body: 'No account, no server. Everything stays on this phone unless you share a backup.',
  },
];

export default function OnboardingScreen({ navigation }: Props) {
  const { palette, completeOnboarding } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const finish = () => {
    completeOnboarding();
    navigation.replace('MainTabs');
  };

  const next = () => {
    if (page >= PAGES.length - 1) {
      finish();
      return;
    }
    const target = page + 1;
    setPage(target);
    scroller.current?.scrollTo({ x: target * width, animated: true });
  };

  return (
    <Backdrop>
      <View style={[styles.root, { paddingTop: insets.top + spacing.xxl }]}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) =>
            setPage(Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width)))
          }
          style={styles.pager}
        >
          {PAGES.map((item) => (
            <View key={item.title} style={[styles.page, { width }]}>
              <Type role="display">{item.title}</Type>
              <Type role="body" color={palette.inkSoft} style={styles.body}>
                {item.body}
              </Type>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.dots}>
            {PAGES.map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === page ? palette.ink : withAlpha(palette.ink, 0.18),
                    width: index === page ? 18 : 6,
                  },
                ]}
              />
            ))}
          </View>
          <Button
            label={page >= PAGES.length - 1 ? "Let's go" : 'Next'}
            variant="primary"
            size="lg"
            fullWidth
            haptic="medium"
            onPress={next}
          />
          <Button
            label="Skip"
            variant="plain"
            size="sm"
            onPress={finish}
            disabled={page >= PAGES.length - 1}
            style={page >= PAGES.length - 1 ? styles.skipHidden : undefined}
          />
        </View>
      </View>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  page: {
    justifyContent: 'center',
    paddingHorizontal: PAGE_PAD,
    gap: spacing.lg,
  },
  body: {
    lineHeight: 26,
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
  skipHidden: {
    opacity: 0,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
