import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { AskBoxPanel } from '../components/AskBoxPanel';
import { EntryCard } from '../components/EntryCard';
import { KIND_CONFIG, KIND_ORDER } from '../constants/kinds';
import { STATUS_FILTER_OPTIONS } from '../constants/status';
import { HIT_SLOP, contrastingInk, radius as radii, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useDebouncedValue } from '../hooks/useDebounce';
import { DictationDenial, useDictation } from '../hooks/useDictation';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { Entry, EntryKind, SortOrder, StatusFilter } from '../types';
import { Chip, IconButton } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { Field } from '../ui/Field';
import { NavAction, NavBar } from '../ui/NavBar';
import { Backdrop } from '../ui/Surface';
import { Type } from '../ui/Type';
import { searchEntries } from '../utils/search';
import { displayTag } from '../utils/tags';

type KindFilter = 'all' | EntryKind | 'archived';

type Props = MainTabScreenProps<'Library'>;

const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  rediscovered: 'Most rediscovered',
  forgotten: 'Longest unseen',
  az: 'A – Z',
};

const SORT_ORDER: SortOrder[] = ['newest', 'oldest', 'forgotten', 'rediscovered', 'az'];

const KIND_TILE_LABEL: Record<EntryKind, string> = {
  idea: 'Ideas',
  note: 'Notes',
  task: 'Tasks',
  journal: 'Journals',
};

const KIND_COUNT_LABEL: Record<EntryKind, [string, string]> = {
  idea: ['idea', 'ideas'],
  note: ['note', 'notes'],
  task: ['task', 'tasks'],
  journal: ['journal entry', 'journal entries'],
};

function countLabel(kindFilter: KindFilter, count: number): string {
  const [singular, plural] = kindFilter === 'all' || kindFilter === 'archived' ? ['item', 'items'] : KIND_COUNT_LABEL[kindFilter];
  return count === 1 ? singular : plural;
}

function sortKey(entry: Entry, order: SortOrder): number | string {
  switch (order) {
    case 'oldest':
      return entry.createdAt;
    case 'rediscovered':
      return -entry.timesRediscovered;
    case 'forgotten':
      return entry.lastViewedAt ?? entry.createdAt;
    case 'az':
      return (entry.title ?? entry.text).toLowerCase();
    case 'newest':
    default:
      return -entry.createdAt;
  }
}

export default function LibraryScreen({ navigation, route }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { palette } = useTheme();
  const { voiceProvider } = useSettings();
  const { entries, categories, loaded, tags: allTags, deleteEntry, restoreEntry, toggleFavorite, updateEntry, setStatus } =
    useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 180);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(route.params?.tag ?? null);
  const [kindFilter, setKindFilter] = useState<KindFilter>(route.params?.kind ?? 'all');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [showAsk, setShowAsk] = useState(false);

  useEffect(() => {
    if (route.params?.tag) setTagFilter(route.params.tag);
  }, [route.params?.tag]);

  useEffect(() => {
    if (route.params?.kind) setKindFilter(route.params.kind);
  }, [route.params?.kind]);

  const dictation = useDictation({
    onText: setQuery,
    maxLength: 120,
    onDenied: useCallback(
      (reason: DictationDenial) => {
        const messages: Record<DictationDenial, string> = {
          unsupported: 'Voice input is not available on this device.',
          'no-model':
            voiceProvider === 'vosk'
              ? 'Voice input needs a one-time speech pack. You can get it in Settings.'
              : "This phone doesn't have a speech recognizer installed. Switch to the offline speech pack in Settings.",
          'no-permission': 'Allow microphone access to search by voice.',
          failed: 'The microphone could not start. Try again.',
        };
        haptics.warning();
        toast.show({ message: messages[reason], tone: 'warning' });
      },
      [haptics, toast, voiceProvider],
    ),
  });

  const folderNames = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  const kindCounts = useMemo(() => {
    const counts: Record<EntryKind, number> = { idea: 0, note: 0, task: 0, journal: 0 };
    for (const entry of entries) {
      if (entry.archivedAt) continue;
      counts[entry.kind ?? 'idea'] += 1;
    }
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    const matches = entries.filter((entry) => {
      if (kindFilter === 'archived') {
        if (!entry.archivedAt) return false;
      } else {
        if (entry.archivedAt) return false;
        if (kindFilter !== 'all' && (entry.kind ?? 'idea') !== kindFilter) return false;
      }

      if (statusFilter === 'favorites') {
        if (!entry.isFavorite) return false;
      } else if (statusFilter !== 'all' && entry.status !== statusFilter) {
        return false;
      }

      if (categoryFilter === 'none' && entry.categoryId) return false;
      if (categoryFilter && categoryFilter !== 'none' && entry.categoryId !== categoryFilter) return false;
      if (tagFilter && !entry.tags.includes(tagFilter)) return false;

      return true;
    });

    const trimmedQuery = debouncedQuery.trim();
    if (trimmedQuery) return searchEntries(matches, trimmedQuery);

    const sorted = matches.sort((a, b) => {
      const left = sortKey(a, sort);
      const right = sortKey(b, sort);
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right));
      }
      return left - right;
    });

    // Pinned entries float to the top of a browsed (not searched) list.
    const pinned = sorted.filter((entry) => entry.isPinned);
    const rest = sorted.filter((entry) => !entry.isPinned);
    return pinned.length > 0 ? [...pinned, ...rest] : sorted;
  }, [entries, debouncedQuery, statusFilter, categoryFilter, tagFilter, kindFilter, sort]);

  const cycleSort = useCallback(() => {
    haptics.light();
    setSort((current) => SORT_ORDER[(SORT_ORDER.indexOf(current) + 1) % SORT_ORDER.length]);
  }, [haptics]);

  const openEntry = useCallback(
    (entry: Entry) => navigation.navigate('EntryDetail', { entryId: entry.id }),
    [navigation],
  );

  const showActions = useCallback(
    (entry: Entry) => {
      haptics.medium();
      Alert.alert(entry.title ?? `This ${KIND_CONFIG[entry.kind ?? 'idea'].label.toLowerCase()}`, undefined, [
        { text: 'Open', onPress: () => openEntry(entry) },
        {
          text: entry.isFavorite ? 'Remove from favourites' : 'Add to favourites',
          onPress: () => toggleFavorite(entry.id),
        },
        {
          text: entry.isPinned ? 'Unpin' : 'Pin to top',
          onPress: () => updateEntry(entry.id, { isPinned: !entry.isPinned }),
        },
        { text: 'Edit', onPress: () => navigation.navigate('EntryEdit', { entryId: entry.id }) },
        {
          text: entry.archivedAt ? 'Unarchive' : 'Archive',
          onPress: () => {
            updateEntry(entry.id, { archivedAt: entry.archivedAt ? null : Date.now() });
            toast.show({ message: entry.archivedAt ? 'Unarchived.' : 'Archived. Find it under the Archived filter.' });
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteEntry(entry.id);
            toast.show({
              message: `${KIND_CONFIG[entry.kind ?? 'idea'].label} deleted.`,
              tone: 'warning',
              action: { label: 'Undo', onPress: () => restoreEntry(entry) },
            });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [haptics, openEntry, toggleFavorite, updateEntry, navigation, deleteEntry, restoreEntry, toast],
  );

  const toggleDone = useCallback(
    (entry: Entry) => {
      haptics.light();
      setStatus(entry.id, entry.status === 'done' ? 'new' : 'done');
    },
    [haptics, setStatus],
  );

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryCard
        entry={item}
        folderName={item.categoryId ? folderNames.get(item.categoryId) : undefined}
        onPress={() => openEntry(item)}
        onLongPress={() => showActions(item)}
        onToggleDone={item.kind === 'task' ? () => toggleDone(item) : undefined}
      />
    ),
    [folderNames, openEntry, showActions, toggleDone],
  );

  const keyExtractor = useCallback((item: Entry) => item.id, []);

  const activeFilters =
    (statusFilter !== 'all' ? 1 : 0) + (categoryFilter ? 1 : 0) + (tagFilter ? 1 : 0) + (kindFilter !== 'all' ? 1 : 0);

  const header = (
    <View style={styles.filters}>
      {showAsk ? (
        <AskBoxPanel
          entries={entries}
          onOpenEntry={(entryId) => navigation.navigate('EntryDetail', { entryId })}
          onOpenSettings={() => navigation.navigate('Models')}
        />
      ) : null}

      <View style={styles.chipRow}>
        <Chip label="Everything" active={kindFilter === 'all'} onPress={() => setKindFilter('all')} />
        {KIND_ORDER.map((option) => (
          <Chip
            key={option}
            label={KIND_CONFIG[option].pickerLabel}
            active={kindFilter === option}
            onPress={() => setKindFilter(option)}
            icon={
              <Ionicons
                name={KIND_CONFIG[option].icon}
                size={12}
                color={kindFilter === option ? contrastingInk(palette.accent) : palette.inkSoft}
              />
            }
          />
        ))}
        <Chip label="Archived" active={kindFilter === 'archived'} onPress={() => setKindFilter('archived')} />
      </View>

      <View style={styles.countRow}>
        {KIND_ORDER.map((kind) => (
          <Pressable
            key={kind}
            onPress={() => setKindFilter(kind)}
            accessibilityRole="button"
            accessibilityLabel={`${kindCounts[kind]} ${KIND_TILE_LABEL[kind].toLowerCase()}`}
            style={[
              styles.countTile,
              { borderRadius: radii.md, backgroundColor: palette.panel, borderColor: palette.edge },
            ]}
          >
            <Type role="heading" color={palette.ink} numberOfLines={1}>
              {kindCounts[kind]}
            </Type>
            <Type role="caption" color={palette.inkSoft} numberOfLines={1} style={styles.countLabel}>
              {KIND_TILE_LABEL[kind]}
            </Type>
          </Pressable>
        ))}
      </View>

      <View style={styles.chipRow}>
        {STATUS_FILTER_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={statusFilter === option.value}
            onPress={() => setStatusFilter(option.value)}
          />
        ))}
      </View>

      {categories.length > 0 ? (
        <View style={styles.chipRow}>
          <Chip label="All folders" active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
          <Chip label="Loose" active={categoryFilter === 'none'} onPress={() => setCategoryFilter('none')} />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              active={categoryFilter === category.id}
              onPress={() => setCategoryFilter(category.id)}
            />
          ))}
        </View>
      ) : null}

      {allTags.length > 0 ? (
        <View style={styles.chipRow}>
          {tagFilter ? (
            <Chip label={`#${displayTag(tagFilter)}`} active onPress={() => setTagFilter(null)} />
          ) : (
            allTags
              .slice(0, 8)
              .map(({ tag, count }) => (
                <Chip key={tag} label={`#${displayTag(tag)}`} count={count} onPress={() => setTagFilter(tag)} />
              ))
          )}
        </View>
      ) : null}

      <View style={styles.summary}>
        <Type role="caption" color={palette.inkSoft}>
          {filtered.length} {countLabel(kindFilter, filtered.length)}
          {activeFilters > 0 ? ' shown' : ''}
        </Type>
        <Pressable
          onPress={cycleSort}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Sorting by ${SORT_LABELS[sort]}. Tap to change.`}
          style={({ pressed }) => [styles.sortButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="swap-vertical" size={14} color={palette.accent} />
          <Type role="caption" color={palette.accent} style={styles.sortLabel}>
            {SORT_LABELS[sort]}
          </Type>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Backdrop>
      <NavBar
        title="Library"
        right={
          <>
            <NavAction
              icon="chatbubble-ellipses-outline"
              label="Ask your box"
              onPress={() => setShowAsk((open) => !open)}
            />
            <NavAction icon="add" label="Add" onPress={() => navigation.navigate('EntryEdit')} />
          </>
        }
        below={
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search your entries"
            left={<Ionicons name="search" size={16} color={palette.inkFaint} />}
            right={
              <View style={styles.searchActions}>
                {dictation.supported ? (
                  <IconButton
                    icon={dictation.starting ? 'hourglass-outline' : dictation.listening ? 'stop-circle' : 'mic-outline'}
                    label={
                      dictation.starting
                        ? 'Starting voice search'
                        : dictation.listening
                          ? 'Stop listening'
                          : 'Search by voice'
                    }
                    size={18}
                    active={dictation.listening}
                    disabled={dictation.starting}
                    onPress={() => void dictation.toggle('')}
                  />
                ) : null}
                {query ? (
                  <IconButton icon="close-circle" label="Clear search" size={18} onPress={() => setQuery('')} />
                ) : null}
              </View>
            }
          />
        }
      />

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.lg }]}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Windowing keeps a large box scrolling smoothly on low-end phones.
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={
          !loaded ? null : entries.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="Nothing saved yet"
              subtitle="Add your first entry and it will start turning up when you least expect it."
              actionLabel="Add"
              onAction={() => navigation.navigate('EntryEdit')}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle="Try a different search, or clear the filters."
              actionLabel={activeFilters > 0 || query ? 'Clear filters' : undefined}
              onAction={
                activeFilters > 0 || query
                  ? () => {
                      setQuery('');
                      setStatusFilter('all');
                      setCategoryFilter(null);
                      setTagFilter(null);
                      setKindFilter('all');
                    }
                  : undefined
              }
            />
          )
        }
      />
    </Backdrop>
  );
}

/** Declared once so the list does not remount every separator on each render. */
function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  filters: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  countRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  countTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countLabel: {
    fontWeight: '600',
  },
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  sortLabel: {
    fontWeight: '600',
  },
  separator: {
    height: spacing.md,
  },
});
