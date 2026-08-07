import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { StatusPicker } from '../components/StatusPicker';
import { SurpriseCard } from '../components/SurpriseCard';
import { KIND_CONFIG, KIND_ORDER } from '../constants/kinds';
import { HIT_SLOP, fonts, fontSizes, radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { Entry, EntryKind, EntryStatus } from '../types';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { IconTile } from '../ui/IconTile';
import { Backdrop, Panel, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import {
  daysUntil,
  dayKey,
  formatDate,
  formatDueLabel,
  isOnThisDay,
  todayKey,
  yearsAgo,
} from '../utils/date';
import { pickSurprise } from '../utils/random';

type Props = MainTabScreenProps<'Home'>;

/** How many recent reveals to avoid repeating. */
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

  const todayJournal = useMemo(
    () => entries.find((entry) => entry.kind === 'journal' && dayKey(new Date(entry.createdAt)) === todayKey()),
    [entries],
  );

  const todayItems = useMemo(() => {
    const now = Date.now();
    const due = entries
      .filter((entry) => entry.kind === 'task' && entry.status !== 'done' && entry.dueAt !== undefined && daysUntil(entry.dueAt) <= 0)
      .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
      .map((entry) => ({ entry, reason: 'due' as const }));
    const reminders = entries
      .filter((entry) => entry.remindAt !== undefined && entry.remindAt <= now)
      .sort((a, b) => (a.remindAt ?? 0) - (b.remindAt ?? 0))
      .map((entry) => ({ entry, reason: 'reminder' as const }));
    return [...due, ...reminders].slice(0, 4);
  }, [entries]);

  const onThisDay = useMemo(
    () => entries.filter((entry) => !entry.archivedAt && isOnThisDay(entry.createdAt)).slice(0, 2),
    [entries],
  );

  const revealed = useMemo(
    () => (revealedId ? entries.find((entry) => entry.id === revealedId) ?? null : null),
    [revealedId, entries],
  );

  const folderName = useMemo(() => {
    if (!revealed?.categoryId) return undefined;
    return categories.find((category) => category.id === revealed.categoryId)?.name;
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

  // Fresh surprise whenever this tab is opened (ref avoids re-firing on entry updates).
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

  const share = (entry: Entry) => {
    const message = entry.title ? `${entry.title}\n\n${entry.text}` : entry.text;
    void Share.share({ message }).catch(() => {});
  };

  const completeTask = (entry: Entry) => {
    haptics.success();
    setStatus(entry.id, 'done');
    toast.show({ message: 'Task done.', tone: 'success' });
  };

  const dismissReminder = (entry: Entry) => {
    haptics.light();
    updateEntry(entry.id, { remindAt: null });
  };

  const openJournal = () => {
    if (todayJournal) {
      navigation.navigate('EntryDetail', { entryId: todayJournal.id });
    } else {
      navigation.navigate('EntryEdit', { initialKind: 'journal' });
    }
  };

  const hasEntries = entries.length > 0;
  const showTodayCard = todayItems.length > 0 || !todayJournal;

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: tabBarHeight + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {streak > 1 ? (
          <View style={styles.streakRow}>
            <View
              style={[
                styles.streak,
                {
                  borderRadius: radii.pill,
                  backgroundColor: withAlpha(palette.accent, 0.14),
                  borderColor: withAlpha(palette.accent, 0.4),
                },
              ]}
              accessibilityLabel={`${streak} day streak`}
            >
              <Ionicons name="flame" size={14} color={palette.accent} />
              <Type role="caption" color={palette.accent} style={styles.streakLabel}>
                {streak} day streak
              </Type>
            </View>
          </View>
        ) : null}

        {!hasEntries ? (
          <EmptyState
            icon="cube-outline"
            title="Your box is empty"
            subtitle="Add something you don't want to forget, then come back for a surprise."
            actionLabel="Add"
            onAction={() => navigation.navigate('EntryEdit')}
          />
        ) : revealed ? (
          <View style={styles.revealArea}>
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
              style={({ pressed }) => [styles.anotherLink, { opacity: pressed ? 0.55 : 1 }]}
            >
              <Type role="body" color={palette.inkSoft} style={styles.anotherText}>
                Show me another.
              </Type>
            </Pressable>

            <View style={styles.secondaryActions}>
              <StatusPicker value={revealed.status} onChange={handleStatus} hideNew />
              <View style={styles.actionRow}>
                <Button
                  label="Open"
                  onPress={() => navigation.navigate('EntryDetail', { entryId: revealed.id })}
                  variant="plain"
                  size="md"
                  style={styles.grow}
                />
                <Button label="Share" onPress={() => share(revealed)} variant="plain" size="md" style={styles.grow} />
                <Button
                  label="Put back"
                  onPress={() => {
                    setRevealedId(null);
                    haptics.light();
                  }}
                  variant="plain"
                  size="md"
                  style={styles.grow}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.idle}>
            <Type role="title" align="center">
              Ready when you are
            </Type>
            <Type role="caption" align="center" color={palette.inkSoft} style={styles.idleHint}>
              {entries.length} {entries.length === 1 ? 'thing' : 'things'} waiting
            </Type>
            <Button label="SURPRISE ME" onPress={surprise} variant="outline" size="lg" fullWidth haptic="medium" />
          </View>
        )}

        {showTodayCard ? (
          <TodayCard
            items={todayItems}
            todayJournal={todayJournal}
            onOpenJournal={openJournal}
            onOpenEntry={(entryId) => navigation.navigate('EntryDetail', { entryId })}
            onCompleteTask={completeTask}
            onDismissReminder={dismissReminder}
          />
        ) : null}

        {onThisDay.length > 0 && !memoryDismissed ? (
          <OnThisDayCard
            entries={onThisDay}
            onOpenEntry={(entryId) => navigation.navigate('EntryDetail', { entryId })}
            onDismiss={() => setMemoryDismissed(true)}
          />
        ) : null}

        <QuickAdd onPick={(kind) => navigation.navigate('EntryEdit', { initialKind: kind })} />
      </ScrollView>
    </Backdrop>
  );
}

function QuickAdd({ onPick }: { onPick: (kind: EntryKind) => void }) {
  const haptics = useHaptics();
  const { palette } = useTheme();
  return (
    <View style={styles.quickAdd} accessibilityRole="none">
      {KIND_ORDER.map((kind) => (
        <Pressable
          key={kind}
          onPress={() => {
            haptics.light();
            onPick(kind);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Add ${KIND_CONFIG[kind].label.toLowerCase()}`}
          style={({ pressed }) => [styles.quickAddItem, pressed && { opacity: 0.7 }]}
        >
          <IconTile icon={KIND_CONFIG[kind].icon} size={44} iconSize={20} tint={palette.accent} />
          <Type role="caption" style={styles.quickAddLabel} numberOfLines={1}>
            {KIND_CONFIG[kind].label}
          </Type>
        </Pressable>
      ))}
    </View>
  );
}

interface TodayEntryItem {
  entry: Entry;
  reason: 'due' | 'reminder';
}

function TodayCard({
  items,
  todayJournal,
  onOpenJournal,
  onOpenEntry,
  onCompleteTask,
  onDismissReminder,
}: {
  items: TodayEntryItem[];
  todayJournal: Entry | undefined;
  onOpenJournal: () => void;
  onOpenEntry: (entryId: string) => void;
  onCompleteTask: (entry: Entry) => void;
  onDismissReminder: (entry: Entry) => void;
}) {
  const { palette } = useTheme();

  return (
    <Panel style={styles.todayCard} borderRadius={radii.lg} borderColor="transparent">
      <Type role="label" pressed>
        Today
      </Type>

      <Pressable
        onPress={onOpenJournal}
        accessibilityRole="button"
        accessibilityLabel={todayJournal ? "Open today's journal entry" : 'Write a journal entry for today'}
        style={({ pressed }) => [styles.todayRow, { opacity: pressed ? 0.65 : 1 }]}
      >
        <Ionicons name="book-outline" size={18} color={palette.inkSoft} />
        <View style={styles.todayRowText}>
          <Type role="bodyStrong" numberOfLines={1}>
            {todayJournal ? "Today's entry" : 'Write today'}
          </Type>
          <Type role="caption" numberOfLines={1} color={palette.inkFaint}>
            {todayJournal ? todayJournal.text : 'A line or two about how today is going.'}
          </Type>
        </View>
      </Pressable>

      {items.map(({ entry, reason }) => {
        const overdue = reason === 'due' && !!entry.dueAt && daysUntil(entry.dueAt) < 0;
        return (
          <View key={entry.id}>
            <Rule />
            <View style={styles.todayRow}>
              {reason === 'due' ? (
                <Pressable
                  onPress={() => onCompleteTask(entry)}
                  hitSlop={HIT_SLOP}
                  accessibilityRole="checkbox"
                  accessibilityLabel="Mark task done"
                >
                  <Ionicons name="square-outline" size={20} color={palette.inkFaint} />
                </Pressable>
              ) : (
                <Ionicons name="notifications-outline" size={18} color={palette.inkSoft} />
              )}
              <Pressable
                onPress={() => onOpenEntry(entry.id)}
                accessibilityRole="button"
                accessibilityLabel={entry.title ?? entry.text.slice(0, 60)}
                style={styles.todayRowText}
              >
                <Type role="bodyStrong" numberOfLines={1}>
                  {entry.title ?? entry.text}
                </Type>
                <Type role="caption" numberOfLines={1} color={overdue ? palette.danger : palette.inkFaint}>
                  {reason === 'due' && entry.dueAt ? formatDueLabel(entry.dueAt) : 'A reminder you set'}
                </Type>
              </Pressable>
              {reason === 'reminder' ? (
                <IconButton icon="close" label="Dismiss reminder" size={16} onPress={() => onDismissReminder(entry)} />
              ) : null}
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

function OnThisDayCard({
  entries: memories,
  onOpenEntry,
  onDismiss,
}: {
  entries: Entry[];
  onOpenEntry: (entryId: string) => void;
  onDismiss: () => void;
}) {
  const { palette } = useTheme();

  return (
    <Panel style={styles.todayCard} borderRadius={radii.lg} borderColor="transparent">
      <View style={styles.memoryHeader}>
        <Type role="label" pressed>
          On this day
        </Type>
        <IconButton icon="close" label="Dismiss" size={16} onPress={onDismiss} />
      </View>

      {memories.map((entry, index) => {
        const years = yearsAgo(entry.createdAt);
        return (
          <View key={entry.id}>
            {index > 0 ? <Rule /> : null}
            <Pressable
              onPress={() => onOpenEntry(entry.id)}
              accessibilityRole="button"
              accessibilityLabel={entry.title ?? entry.text.slice(0, 60)}
              style={({ pressed }) => [styles.todayRow, { opacity: pressed ? 0.65 : 1 }]}
            >
              <View style={styles.todayRowText}>
                <Type role="bodyStrong" numberOfLines={1}>
                  {entry.title ?? entry.text}
                </Type>
                <Type role="caption" numberOfLines={1} color={palette.inkFaint}>
                  {years === 1 ? 'A year ago' : `${years} years ago`} · {formatDate(entry.createdAt)}
                </Type>
              </View>
            </Pressable>
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  streakRow: {
    alignItems: 'flex-end',
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  streakLabel: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textTransform: 'none',
    letterSpacing: 0,
  },
  revealArea: {
    gap: spacing.xl,
    minHeight: 320,
    justifyContent: 'center',
    paddingTop: spacing.xxl,
  },
  anotherLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.sm,
  },
  anotherText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    textDecorationLine: 'underline',
    textDecorationColor: '#9A948A',
  },
  secondaryActions: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
  idle: {
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
    alignItems: 'stretch',
  },
  idleHint: {
    marginBottom: spacing.md,
  },
  quickAdd: {
    flexDirection: 'row',
  },
  quickAddItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  quickAddLabel: {
    fontWeight: '600',
  },
  todayCard: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  todayRowText: {
    flex: 1,
    gap: 1,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
