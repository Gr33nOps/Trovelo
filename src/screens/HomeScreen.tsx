import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { StatusPicker } from '../components/StatusPicker';
import { SurpriseCard } from '../components/SurpriseCard';
import { HIT_SLOP, PAGE_PAD, radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { EntryStatus } from '../types';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { Backdrop, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import { dayKey, formatDate, isOnThisDay, yearsAgo } from '../utils/date';
import { pickSurprise } from '../utils/random';

type Props = MainTabScreenProps<'Home'>;
const RECENT_WINDOW = 8;

export default function HomeScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { entries, categories, recordViewed, setStatus, toggleFavorite, updateEntry } = useEntries();
  const { palette, streak } = useTheme();
  const haptics = useHaptics();
  const toast = useToast();

  const [revealedId, setRevealedId] = useState<string | null>(null);
  const recentlyShown = useRef<string[]>([]);
  const [memoryDismissed, setMemoryDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const currentDay = dayKey(new Date(now));

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const timer = setInterval(refreshClock, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshClock();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => setMemoryDismissed(false), [currentDay]);

  const reminders = useMemo(
    () =>
      entries
        .filter((entry) => !entry.archivedAt && entry.remindAt !== undefined && entry.remindAt <= now)
        .sort((a, b) => (a.remindAt ?? 0) - (b.remindAt ?? 0))
        .slice(0, 4),
    [entries, now],
  );

  const onThisDay = useMemo(
    () => entries.filter((entry) => !entry.archivedAt && isOnThisDay(entry.createdAt, new Date(now))).slice(0, 2),
    [entries, now],
  );

  const revealed = useMemo(
    () => (revealedId ? entries.find((e) => e.id === revealedId) ?? null : null),
    [revealedId, entries],
  );

  const folderName = useMemo(() => {
    if (!revealed?.categoryId) return undefined;
    return categories.find((c) => c.id === revealed.categoryId)?.name;
  }, [revealed?.categoryId, categories]);

  const surprise = useCallback(() => {
    const next = pickSurprise(entries, recentlyShown.current);
    if (!next) {
      haptics.warning();
      toast.show({ message: 'Nothing to show yet. Add something first.' });
      return;
    }
    const window = Math.max(0, Math.min(RECENT_WINDOW, entries.length - 1));
    const trail = [...recentlyShown.current, next.id];
    recentlyShown.current = window === 0 ? [] : trail.slice(-window);
    setRevealedId(next.id);
    recordViewed(next.id);
    haptics.medium();
  }, [entries, haptics, recordViewed, toast]);

  const surpriseRef = useRef(surprise);
  surpriseRef.current = surprise;

  useFocusEffect(
    useCallback(() => {
      surpriseRef.current();
    }, []),
  );

  const handleStatus = (status: EntryStatus) => {
    if (!revealed) return;
    setStatus(revealed.id, status);
    haptics.light();
    if (status === 'not_useful') {
      toast.show({ message: 'Kept, but it will stop turning up in surprises.' });
    }
  };

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: tabBarHeight + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {streak > 1 ? (
          <View style={styles.streakWrap}>
            <View
              style={[
                styles.streak,
                {
                  backgroundColor: withAlpha(palette.accent, 0.12),
                  borderColor: withAlpha(palette.accent, 0.3),
                },
              ]}
            >
              <Ionicons name="flame" size={13} color={palette.accent} />
              <Type role="caption" color={palette.accent} style={styles.streakText}>
                {streak} day streak
              </Type>
            </View>
          </View>
        ) : null}

        {entries.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="Your box is empty"
            subtitle="Add something, then come back for a surprise."
            actionLabel="Add"
            onAction={() => navigation.navigate('EntryEdit')}
          />
        ) : revealed ? (
          <View style={styles.reveal}>
            <SurpriseCard
              entry={revealed}
              folderName={folderName}
              onToggleFavorite={() => {
                toggleFavorite(revealed.id);
                haptics.light();
              }}
            />

            <Pressable
              onPress={surprise}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Show me another"
              style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, alignSelf: 'flex-start' }]}
            >
              <Type role="body" color={palette.inkSoft} style={styles.another}>
                Show me another
              </Type>
            </Pressable>

            <View style={styles.actions}>
              <StatusPicker value={revealed.status} onChange={handleStatus} hideNew />
              <View style={styles.row}>
                <Button
                  label="Open"
                  onPress={() => navigation.navigate('EntryDetail', { entryId: revealed.id })}
                  variant="plain"
                  size="md"
                  style={styles.flex}
                />
                <Button
                  label="Share"
                  onPress={() => {
                    const msg = revealed.title ? `${revealed.title}\n\n${revealed.text}` : revealed.text;
                    void Share.share({ message: msg }).catch(() => {
                      haptics.warning();
                      toast.show({ message: 'This entry could not be shared.', tone: 'warning' });
                    });
                  }}
                  variant="plain"
                  size="md"
                  style={styles.flex}
                />
                <Button
                  label="Put back"
                  onPress={() => {
                    setRevealedId(null);
                    haptics.light();
                  }}
                  variant="plain"
                  size="md"
                  style={styles.flex}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.idle}>
            <Type role="title" align="center">
              Ready when you are
            </Type>
            <Button label="SURPRISE ME" onPress={surprise} variant="outline" size="lg" fullWidth haptic="medium" />
          </View>
        )}

        {reminders.length > 0 ? (
          <View style={styles.section}>
            <Type role="label">Reminders</Type>
            {reminders.map((entry, i) => (
              <View key={entry.id}>
                {i > 0 ? <Rule /> : null}
                <View style={styles.lineRow}>
                  <Ionicons name="notifications-outline" size={18} color={palette.inkSoft} />
                  <Pressable
                    onPress={() => {
                      updateEntry(entry.id, { remindAt: null });
                      navigation.navigate('EntryDetail', { entryId: entry.id });
                    }}
                    style={styles.flex}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${entry.title ?? entry.text.slice(0, 60)}`}
                  >
                    <Type role="bodyStrong" numberOfLines={1}>
                      {entry.title ?? entry.text}
                    </Type>
                    <Type role="caption" color={palette.inkFaint} numberOfLines={1}>
                      Reminder
                    </Type>
                  </Pressable>
                  <IconButton
                    icon="close"
                    label="Dismiss reminder"
                    size={16}
                    onPress={() => updateEntry(entry.id, { remindAt: null })}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {onThisDay.length > 0 && !memoryDismissed ? (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Type role="label">On this day</Type>
              <IconButton icon="close" label="Dismiss" size={16} onPress={() => setMemoryDismissed(true)} />
            </View>
            {onThisDay.map((entry, i) => {
              const years = yearsAgo(entry.createdAt, new Date(now));
              return (
                <View key={entry.id}>
                  {i > 0 ? <Rule /> : null}
                  <Pressable
                    onPress={() => navigation.navigate('EntryDetail', { entryId: entry.id })}
                    style={({ pressed }) => [styles.line, { opacity: pressed ? 0.55 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${entry.title ?? entry.text.slice(0, 60)}`}
                  >
                    <Type role="bodyStrong" numberOfLines={1}>
                      {entry.title ?? entry.text}
                    </Type>
                    <Type role="caption" color={palette.inkFaint}>
                      {years === 1 ? 'A year ago' : `${years} years ago`} · {formatDate(entry.createdAt)}
                    </Type>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: PAGE_PAD,
    gap: spacing.xxl,
  },
  streakWrap: {
    alignItems: 'flex-end',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  streakText: {
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '600',
  },
  reveal: {
    gap: spacing.xl,
    paddingTop: spacing.lg,
  },
  another: {
    textDecorationLine: 'underline',
  },
  actions: {
    gap: spacing.lg,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  idle: {
    gap: spacing.xl,
    paddingVertical: spacing.xxxl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  line: {
    paddingVertical: spacing.sm,
    gap: 2,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
});
