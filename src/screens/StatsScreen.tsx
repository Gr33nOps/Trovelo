import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { KIND_CONFIG, KIND_ORDER } from '../constants/kinds';
import { STATUS_CONFIG, STATUS_ORDER } from '../constants/status';
import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { MainTabScreenProps } from '../navigation';
import { EntryKind, EntryStatus } from '../types';
import { EmptyState } from '../ui/EmptyState';
import { SectionHeader } from '../ui/Group';
import { IconTile } from '../ui/IconTile';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel, Well } from '../ui/Surface';
import { Type } from '../ui/Type';
import { displayTag } from '../utils/tags';

type Props = MainTabScreenProps<'Stats'>;

const DAY = 86_400_000;

export default function StatsScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { palette, streak, bestStreak, daysOpened } = useTheme();
  const { entries, tags } = useEntries();

  const stats = useMemo(() => {
    const byStatus: Record<EntryStatus, number> = { new: 0, interesting: 0, done: 0, not_useful: 0 };
    const byKind: Record<EntryKind, number> = { idea: 0, note: 0, task: 0, journal: 0 };
    let rediscoveries = 0;
    let favorites = 0;
    let words = 0;
    let oldestUnseen: number | null = null;
    const now = Date.now();
    let addedThisMonth = 0;
    let openTasks = 0;
    let archived = 0;

    for (const entry of entries) {
      byStatus[entry.status] += 1;
      byKind[entry.kind ?? 'idea'] += 1;
      rediscoveries += entry.timesRediscovered;
      if (entry.isFavorite) favorites += 1;
      if (entry.archivedAt) archived += 1;
      if (entry.kind === 'task' && entry.status !== 'done') openTasks += 1;
      words += entry.text.trim().split(/\s+/).filter(Boolean).length;
      if (now - entry.createdAt < 30 * DAY) addedThisMonth += 1;
      const lastSeen = entry.lastViewedAt ?? entry.createdAt;
      if (oldestUnseen === null || lastSeen < oldestUnseen) oldestUnseen = lastSeen;
    }

    const neverSeen = entries.filter((entry) => !entry.lastViewedAt).length;

    return {
      total: entries.length,
      byStatus,
      byKind,
      rediscoveries,
      favorites,
      words,
      addedThisMonth,
      neverSeen,
      openTasks,
      archived,
      oldestUnseenDays:
        oldestUnseen === null ? 0 : Math.floor((now - oldestUnseen) / DAY),
    };
  }, [entries]);

  const hasMixedKinds = KIND_ORDER.some((kind) => kind !== 'idea' && stats.byKind[kind] > 0);

  if (entries.length === 0) {
    return (
      <Backdrop>
        <NavBar title="Stats" align="start" large borderless />
        <EmptyState
          icon="stats-chart-outline"
          title="Nothing to count yet"
          subtitle="Once you have saved a few entries, this is where you will see how the box is doing."
          actionLabel="Add"
          onAction={() => navigation.navigate('EntryEdit')}
        />
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      {/* This is a tab root, reached by tapping the Stats tab, not pushed on
          top of anything, so there is nothing to go back to. The stray title
          and back button were left over from before Stats was a tab. */}
      <NavBar title="Stats" align="start" large borderless />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          <StatTile icon="albums-outline" label="Entries saved" value={stats.total} />
          <StatTile icon="refresh-outline" label="Rediscoveries" value={stats.rediscoveries} />
          <StatTile icon="checkmark-circle-outline" label="Acted on" value={stats.byStatus.done} />
          <StatTile icon="star-outline" label="Favourites" value={stats.favorites} />
        </View>

        <View>
          <SectionHeader title="Streak" hint="Open the app on consecutive days to build it up." />
          <Panel style={styles.streakCard} borderRadius={radii.lg}>
            <View style={styles.streakMain}>
              <Ionicons name="flame" size={30} color={streak > 0 ? palette.accent : palette.inkFaint} />
              <View style={styles.streakText}>
                <Type role="hero" pressed style={styles.streakValue}>
                  {streak}
                </Type>
                <Type role="caption">{streak === 1 ? 'day in a row' : 'days in a row'}</Type>
              </View>
            </View>
            <View style={[styles.streakSide, { borderLeftColor: palette.edge }]}>
              <Detail label="Best ever" value={`${bestStreak} ${bestStreak === 1 ? 'day' : 'days'}`} />
              <Detail label="Days opened" value={String(daysOpened)} />
            </View>
          </Panel>
        </View>

        <View>
          <SectionHeader title="Where things stand" />
          <Panel style={styles.card} borderRadius={radii.lg}>
            {STATUS_ORDER.map((status) => {
              const count = stats.byStatus[status];
              const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;
              const color = palette.accent;
              return (
                <View
                  key={status}
                  style={styles.barRow}
                  accessibilityLabel={`${STATUS_CONFIG[status].label}: ${count} of ${stats.total}`}
                >
                  <View style={styles.barLabel}>
                    <Ionicons name={STATUS_CONFIG[status].icon} size={13} color={color} />
                    <Type role="caption" color={palette.ink} numberOfLines={1}>
                      {STATUS_CONFIG[status].label}
                    </Type>
                  </View>
                  <Well style={styles.barTrack} borderRadius={radii.pill}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.max(count > 0 ? 3 : 0, percent)}%`, backgroundColor: color },
                      ]}
                    />
                  </Well>
                  <Type role="caption" color={palette.inkSoft} style={styles.barCount}>
                    {count}
                  </Type>
                </View>
              );
            })}
          </Panel>
        </View>

        {hasMixedKinds ? (
          <View>
            <SectionHeader title="What is in the box" />
            <Panel style={styles.card} borderRadius={radii.lg}>
              {KIND_ORDER.filter((kind) => stats.byKind[kind] > 0).map((kind) => {
                const count = stats.byKind[kind];
                const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <View
                    key={kind}
                    style={styles.barRow}
                    accessibilityLabel={`${KIND_CONFIG[kind].label}: ${count} of ${stats.total}`}
                  >
                    <View style={styles.barLabel}>
                      <Ionicons name={KIND_CONFIG[kind].icon} size={13} color={palette.accent} />
                      <Type role="caption" color={palette.ink} numberOfLines={1}>
                        {KIND_CONFIG[kind].label}
                      </Type>
                    </View>
                    <Well style={styles.barTrack} borderRadius={radii.pill}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.max(count > 0 ? 3 : 0, percent)}%`, backgroundColor: palette.accent },
                        ]}
                      />
                    </Well>
                    <Type role="caption" color={palette.inkSoft} style={styles.barCount}>
                      {count}
                    </Type>
                  </View>
                );
              })}
              {stats.openTasks > 0 ? (
                <Insight
                  icon="checkbox-outline"
                  text={`${stats.openTasks} open ${stats.openTasks === 1 ? 'task' : 'tasks'}.`}
                />
              ) : null}
              {stats.archived > 0 ? (
                <Insight
                  icon="archive-outline"
                  text={`${stats.archived} archived ${stats.archived === 1 ? 'entry' : 'entries'}.`}
                />
              ) : null}
            </Panel>
          </View>
        ) : null}

        <View>
          <SectionHeader title="Worth knowing" />
          <Panel style={styles.card} borderRadius={radii.lg}>
            <Insight
              icon="eye-off-outline"
              text={
                stats.neverSeen > 0
                  ? `${stats.neverSeen} ${stats.neverSeen === 1 ? 'entry has' : 'entries have'} never come back out of the box.`
                  : 'Everything in your box has resurfaced at least once.'
              }
            />
            <Insight
              icon="time-outline"
              text={`The entry you have not seen for longest has been waiting ${stats.oldestUnseenDays} ${stats.oldestUnseenDays === 1 ? 'day' : 'days'}.`}
            />
            <Insight
              icon="add-circle-outline"
              text={`${stats.addedThisMonth} ${stats.addedThisMonth === 1 ? 'entry' : 'entries'} added in the last 30 days.`}
            />
            <Insight
              icon="text-outline"
              text={`About ${stats.words.toLocaleString()} words written in total.`}
            />
          </Panel>
        </View>

        {tags.length > 0 ? (
          <View>
            <SectionHeader title="Most used tags" />
            <Panel style={styles.card} borderRadius={radii.lg}>
              <View style={styles.tagCloud}>
                {tags.slice(0, 12).map(({ tag, count }) => (
                  <View
                    key={tag}
                    style={[
                      styles.tagPill,
                      {
                        borderRadius: radii.pill,
                        backgroundColor: withAlpha(palette.accent, 0.1),
                        borderColor: withAlpha(palette.accent, 0.3),
                      },
                    ]}
                  >
                    <Type role="caption" color={palette.accent} style={styles.tagLabel}>
                      #{displayTag(tag)}
                    </Type>
                    <Type role="caption" color={palette.inkFaint} style={styles.tagCount}>
                      {count}
                    </Type>
                  </View>
                ))}
              </View>
            </Panel>
          </View>
        ) : null}
      </ScrollView>
    </Backdrop>
  );
}

function StatTile({
  icon,
  label,
  value,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tint?: string;
}) {
  const { palette } = useTheme();
  const color = tint ?? palette.accent;
  return (
    <Panel style={styles.tile} borderRadius={radii.lg}>
      <IconTile icon={icon} tint={tint} size={30} iconSize={15} />
      <Type role="title" color={color} pressed style={styles.tileValue}>
        {value.toLocaleString()}
      </Type>
      <Type role="caption" numberOfLines={2}>
        {label}
      </Type>
    </Panel>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Type role="label" pressed>
        {label}
      </Type>
      <Type role="caption">{value}</Type>
    </View>
  );
}

function Insight({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { palette } = useTheme();
  return (
    <View style={styles.insight}>
      <IconTile icon={icon} size={28} iconSize={14} />
      <Type role="caption" color={palette.ink} style={styles.insightText}>
        {text}
      </Type>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: spacing.md,
    gap: 2,
  },
  tileValue: {
    fontVariant: ['tabular-nums'],
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  streakMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  streakText: {
    flex: 1,
  },
  streakValue: {
    fontVariant: ['tabular-nums'],
  },
  streakSide: {
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  detail: {
    gap: 1,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  barLabel: {
    width: 118,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barTrack: {
    flex: 1,
    height: 10,
    padding: 1,
    justifyContent: 'center',
  },
  barFill: {
    height: '100%',
    borderRadius: radii.pill,
  },
  barCount: {
    width: 30,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  insight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  insightText: {
    flex: 1,
    lineHeight: 21,
  },
  tagCloud: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagLabel: {
    fontWeight: '600',
  },
  tagCount: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
});
