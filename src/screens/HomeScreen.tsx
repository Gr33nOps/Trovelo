import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';

import { EntryCard } from '../components/EntryCard';
import { StatusPicker } from '../components/StatusPicker';
import { SurpriseCard } from '../components/SurpriseCard';
import { KIND_CONFIG, KIND_ORDER } from '../constants/kinds';
import { HIT_SLOP, radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { Category, Entry, EntryKind, EntryStatus } from '../types';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { IconTile } from '../ui/IconTile';
import { NavAction, NavBar } from '../ui/NavBar';
import { Backdrop, Panel, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import {
  daysUntil,
  dayKey,
  formatDate,
  formatDueLabel,
  formatFullDate,
  greetingForHour,
  isOnThisDay,
  todayKey,
  yearsAgo,
} from '../utils/date';
import { pickSurprise } from '../utils/random';

type Props = MainTabScreenProps<'Home'>;

/** How many recent reveals to avoid repeating. */
const RECENT_WINDOW = 8;
/** Entries shown in "Recently added", newest first. */
const RECENT_COUNT = 4;

export default function HomeScreen({ navigation }: Props) {
  // useBottomTabBarHeight() already includes the bottom safe-area inset, since
  // the tab bar itself pads for it. Adding insets.bottom on top of that (the
  // old code did) double-counted it and left far more empty space under the
  // last item than the small gap that was intended.
  const tabBarHeight = useBottomTabBarHeight();
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

  const recentEntries = useMemo(
    () =>
      entries
        .filter((entry) => !entry.archivedAt)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, RECENT_COUNT),
    [entries],
  );

  const folderNames = useMemo(
    () => new Map(categories.map((category: Category) => [category.id, category.name])),
    [categories],
  );

  // Read the live entry so edits made elsewhere show up on the card.
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

    // Keep a short trail of what was just shown. The old version computed a
    // window of 0 for a one-entry box, and `slice(-0)` returns the whole array,
    // so the exclusion list grew without bound.
    const window = Math.max(0, Math.min(RECENT_WINDOW, entries.length - 1));
    const trail = [...recentlyShown.current, next.id];
    recentlyShown.current = window === 0 ? [] : trail.slice(-window);

    setRevealedId(next.id);
    recordViewed(next.id);
    haptics.medium();
  }, [entries, haptics, recordViewed, toast]);

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

  const openEntry = (entryId: string) => navigation.navigate('EntryDetail', { entryId });

  const toggleDone = (entry: Entry) => {
    haptics.light();
    setStatus(entry.id, entry.status === 'done' ? 'new' : 'done');
  };

  const hasEntries = entries.length > 0;
  const showTodayCard = todayItems.length > 0 || !todayJournal;

  return (
    <Backdrop>
      <NavBar
        title="Trovelo"
        subtitle={formatFullDate(new Date())}
        right={<NavAction icon="add" label="Add" onPress={() => navigation.navigate('EntryEdit')} />}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingRow}>
          <Type role="title" pressed>
            {greetingForHour()}
          </Type>
          {streak > 1 ? (
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
              <Ionicons name="flame" size={13} color={palette.accent} />
              <Type role="caption" color={palette.accent} style={styles.streakLabel}>
                {streak}
              </Type>
            </View>
          ) : null}
        </View>

        <QuickAdd onPick={(kind) => navigation.navigate('EntryEdit', { initialKind: kind })} />

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

        {!hasEntries ? (
          <Panel style={styles.emptyPanel} borderRadius={radii.xl}>
            <EmptyState
              icon="cube-outline"
              title="Your box is empty"
              subtitle="Add something you don't want to forget."
              actionLabel="Add"
              onAction={() => navigation.navigate('EntryEdit')}
            />
          </Panel>
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

            <Panel style={styles.actionPanel} borderRadius={radii.lg}>
              <Type role="label" pressed>
                How does it look now?
              </Type>
              <StatusPicker value={revealed.status} onChange={handleStatus} hideNew />

              <View style={styles.actionRow}>
                <Button
                  label="Another one"
                  onPress={surprise}
                  variant="primary"
                  size="md"
                  haptic="medium"
                  style={styles.grow}
                  icon={<Ionicons name="shuffle" size={16} color={palette.accentInk} />}
                />
                <Button
                  label="Open"
                  onPress={() => navigation.navigate('EntryDetail', { entryId: revealed.id })}
                  variant="secondary"
                  size="md"
                  style={styles.grow}
                />
              </View>

              <View style={styles.actionRow}>
                <Button
                  label="Share"
                  onPress={() => share(revealed)}
                  variant="plain"
                  size="sm"
                  style={styles.grow}
                />
                <Button
                  label="Put it back"
                  onPress={() => {
                    setRevealedId(null);
                    haptics.light();
                  }}
                  variant="plain"
                  size="sm"
                  style={styles.grow}
                />
              </View>
            </Panel>
          </View>
        ) : (
          <View style={styles.dashboard}>
            <SurpriseTeaser count={entries.length} onOpen={surprise} />

            {recentEntries.length > 0 ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Type role="label" pressed>
                    Recently added
                  </Type>
                  <Pressable
                    onPress={() => navigation.navigate('Library')}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel="See everything in the library"
                  >
                    <Type role="caption" color={palette.accent}>
                      See all
                    </Type>
                  </Pressable>
                </View>
                <View style={styles.recentList}>
                  {recentEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      folderName={entry.categoryId ? folderNames.get(entry.categoryId) : undefined}
                      onPress={() => openEntry(entry.id)}
                      onToggleDone={entry.kind === 'task' ? () => toggleDone(entry) : undefined}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </Backdrop>
  );
}

/** One tap from Home straight into a new entry of a given kind. */
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
          style={({ pressed }) => [styles.quickAddItem, pressed && styles.surprisePressed]}
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

/**
 * A single, normally-sized row rather than a screen-dominating hero: the app
 * does a lot more than rediscovery now, so Surprise Me is one entry point
 * among several rather than the entire point of the home screen.
 */
function SurpriseTeaser({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { palette } = useTheme();

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Surprise me. ${count} ${count === 1 ? 'thing' : 'things'} in the box.`}
      accessibilityHint="Shows one thing you saved earlier, picked for you"
      style={({ pressed }) => [pressed && styles.surprisePressed]}
    >
      <Panel style={styles.surpriseCard} borderRadius={radii.lg} gradient={palette.accentGradient} texture="none">
        <Ionicons name="sparkles" size={20} color={palette.accentInk} />
        <View style={styles.surpriseText}>
          <Type role="bodyStrong" color={palette.accentInk} onAccent>
            Surprise me
          </Type>
          <Type role="caption" color={palette.accentInk} onAccent numberOfLines={1} style={styles.surpriseHint}>
            {count} {count === 1 ? 'thing' : 'things'} waiting, picks what you have seen least
          </Type>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.accentInk} />
      </Panel>
    </Pressable>
  );
}

interface TodayEntryItem {
  entry: Entry;
  reason: 'due' | 'reminder';
}

/** Due tasks, due reminders and the day's journal prompt, only when any of them exist. */
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
    <Panel style={styles.todayCard} borderRadius={radii.lg}>
      <Type role="label" pressed>
        Today
      </Type>

      <Pressable
        onPress={onOpenJournal}
        accessibilityRole="button"
        accessibilityLabel={todayJournal ? "Open today's journal entry" : 'Write a journal entry for today'}
        style={({ pressed }) => [styles.todayRow, { opacity: pressed ? 0.65 : 1 }]}
      >
        <Ionicons name="book-outline" size={17} color={palette.inkSoft} />
        <View style={styles.todayRowText}>
          <Type role="bodyStrong" numberOfLines={1}>
            {todayJournal ? "Today's entry" : 'Write today'}
          </Type>
          <Type role="caption" numberOfLines={1} color={palette.inkFaint}>
            {todayJournal ? todayJournal.text : 'A line or two about how today is going.'}
          </Type>
        </View>
        <Ionicons name="chevron-forward" size={15} color={palette.inkFaint} />
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
                  <Ionicons name="square-outline" size={19} color={palette.inkFaint} />
                </Pressable>
              ) : (
                <Ionicons name="notifications-outline" size={17} color={palette.inkSoft} />
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

/** Entries saved on this calendar date in an earlier year. Dismissible per session. */
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
    <Panel style={styles.todayCard} borderRadius={radii.lg}>
      <View style={styles.memoryHeader}>
        <View style={styles.memoryHeaderText}>
          <Ionicons name="time-outline" size={16} color={palette.inkSoft} />
          <Type role="label" pressed>
            On this day
          </Type>
        </View>
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
              <Ionicons name="chevron-forward" size={15} color={palette.inkFaint} />
            </Pressable>
          </View>
        );
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
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
  memoryHeaderText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyPanel: {
    paddingVertical: spacing.sm,
  },
  dashboard: {
    gap: spacing.lg,
  },
  surprisePressed: {
    opacity: 0.85,
  },
  surpriseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  surpriseText: {
    flex: 1,
    gap: 1,
  },
  surpriseHint: {
    opacity: 0.85,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  recentList: {
    gap: spacing.sm,
  },
  revealArea: {
    gap: spacing.md,
  },
  actionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
