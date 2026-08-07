import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../navigation';
import { Button } from '../ui/Button';
import { Backdrop } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

interface Page {
  title: string;
  body: string;
}

const PAGES: Page[] = [
  {
    title: 'One place for everything',
    body: 'Ideas, notes, tasks and journal entries all go in the same box. No folders required, no tidying up.',
  },
  {
    title: 'Rediscover what you saved',
    body: 'Tap Surprise Me and something comes back when you least expect it. Or just search for it directly.',
  },
  {
    title: 'A quiet helper, on your phone',
    body: 'An optional assistant can tidy your wording, suggest tags or answer questions about what you have saved. On this phone by default, nothing uploaded; you can connect a cloud provider instead if you choose to.',
  },
  {
    title: 'Yours alone',
    body: 'No account, no server. Everything stays on this phone by default. A backup only leaves when you share it, and can be locked with a password.',
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
      <View style={[styles.root, { paddingTop: insets.top }]}>
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
              <View style={styles.card}>
                <Type role="display" align="center">
                  {item.title}
                </Type>
                <Type role="body" align="center" color={palette.inkSoft} style={styles.body}>
                  {item.body}
                </Type>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {PAGES.map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === page ? palette.accent : withAlpha(palette.ink, 0.2),
                    width: index === page ? 20 : 7,
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
          {/*
            Always rendered, just made invisible on the last page, so the
            footer keeps a constant height. Conditionally omitting this button
            made the primary button above it visibly jump down a row on the
            final page.
          */}
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
    paddingHorizontal: spacing.lg,
  },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
    alignItems: 'center',
  },
  body: {
    lineHeight: 28,
    paddingHorizontal: spacing.md,
  },
  footer: {
    paddingHorizontal: spacing.xl,
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
    marginBottom: spacing.xs,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
});
