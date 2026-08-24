import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryCard } from '../components/EntryCard';
import { STATUS_FILTER_OPTIONS } from '../constants/status';
import { HIT_SLOP, PAGE_PAD, fonts, fontSizes, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { Entry, SortOrder, StatusFilter } from '../types';
import { ActionSheet } from '../ui/ActionSheet';
import { Button } from '../ui/Button';
import { Chip, IconButton } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { Backdrop, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import { searchEntries } from '../utils/search';
import { displayTag } from '../utils/tags';
import { todayKey } from '../utils/date';

type Props = MainTabScreenProps<'Library'>;

const SORT_LABELS: Record<SortOrder, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  rediscovered: 'Most seen',
  forgotten: 'Longest unseen',
  az: 'A – Z',
};
const SORT_ORDER: SortOrder[] = ['newest', 'oldest', 'forgotten', 'rediscovered', 'az'];

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
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { entries, categories, loaded, tags: allTags, deleteEntry, restoreEntry, toggleFavorite, updateEntry } =
    useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 180);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(route.params?.tag ?? null);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortOrder>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [actionEntry, setActionEntry] = useState<Entry | null>(null);
  const [dayVersion, setDayVersion] = useState(todayKey);

  useEffect(() => {
    const refreshDay = () => setDayVersion(todayKey());
    const timer = setInterval(refreshDay, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDay();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (route.params?.tag) setTagFilter(route.params.tag);
  }, [route.params?.tag]);

  const folderNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const keptCount = useMemo(() => entries.filter((e) => !e.archivedAt).length, [entries]);

  const filtered = useMemo(() => {
    const matches = entries.filter((entry) => {
      if (showArchived) {
        if (!entry.archivedAt) return false;
      } else if (entry.archivedAt) {
        return false;
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

    const trimmed = debouncedQuery.trim();
    if (trimmed) return searchEntries(matches, trimmed);

    const sorted = matches.sort((a, b) => {
      const left = sortKey(a, sort);
      const right = sortKey(b, sort);
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right));
      }
      return left - right;
    });
    const pinned = sorted.filter((e) => e.isPinned);
    const rest = sorted.filter((e) => !e.isPinned);
    return pinned.length ? [...pinned, ...rest] : sorted;
  }, [entries, debouncedQuery, statusFilter, categoryFilter, tagFilter, showArchived, sort]);

  const openEntry = useCallback(
    (entry: Entry) => navigation.navigate('EntryDetail', { entryId: entry.id }),
    [navigation],
  );

  const showActions = useCallback(
    (entry: Entry) => {
      haptics.medium();
      setActionEntry(entry);
    },
    [haptics],
  );

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryCard
        entry={item}
        folderName={item.categoryId ? folderNames.get(item.categoryId) : undefined}
        onPress={() => openEntry(item)}
        onLongPress={() => showActions(item)}
        dayVersion={dayVersion}
      />
    ),
    [folderNames, openEntry, showActions, dayVersion],
  );

  const activeExtra =
    (statusFilter !== 'all' ? 1 : 0) + (categoryFilter ? 1 : 0) + (tagFilter ? 1 : 0) + (showArchived ? 1 : 0);

  const header = (
    <View style={styles.header}>
      <View style={{ height: insets.top }} />

      <View style={styles.brand}>
        <Type role="display" accessibilityRole="header">
          Trovelo
        </Type>
        <Type role="caption" color={palette.inkFaint}>
          {keptCount} {keptCount === 1 ? 'thing' : 'things'} kept
        </Type>
      </View>

      <Button
        label="SURPRISE ME"
        onPress={() => {
          haptics.medium();
          navigation.navigate('Home');
        }}
        variant="outline"
        size="lg"
        fullWidth
        haptic="medium"
      />

      <View style={[styles.search, { borderBottomColor: palette.edge }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={palette.inkFaint}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search"
          selectionColor={palette.accent}
          cursorColor={palette.accent}
          style={[styles.searchInput, { color: palette.ink, fontFamily: fonts.body, fontSize: fontSizes.md }]}
        />
        {query ? <IconButton icon="close-circle" label="Clear" size={20} onPress={() => setQuery('')} /> : null}
      </View>

      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Filters"
        >
          <Type role="caption" color={palette.inkSoft}>
            {filtered.length} shown{activeExtra > 0 ? ` · ${activeExtra} filters` : ''}
            {showFilters ? ' · hide' : ''}
          </Type>
        </Pressable>
        <Pressable
          onPress={() => {
            haptics.light();
            setSort((s) => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]);
          }}
          hitSlop={HIT_SLOP}
          style={styles.sort}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${SORT_LABELS[sort]}`}
        >
          <Ionicons name="swap-vertical" size={15} color={palette.inkSoft} />
          <Type role="caption" color={palette.inkSoft}>
            {SORT_LABELS[sort]}
          </Type>
        </Pressable>
      </View>

      {showFilters ? (
        <View style={styles.filters}>
          <View style={styles.chips}>
            <Chip label="Archived" active={showArchived} onPress={() => setShowArchived((v) => !v)} />
            {STATUS_FILTER_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                active={statusFilter === o.value}
                onPress={() => setStatusFilter(o.value)}
              />
            ))}
          </View>
          {categories.length > 0 ? (
            <View style={styles.chips}>
              <Chip label="All folders" active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
              <Chip label="Loose" active={categoryFilter === 'none'} onPress={() => setCategoryFilter('none')} />
              {categories.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={categoryFilter === c.id}
                  onPress={() => setCategoryFilter(c.id)}
                />
              ))}
            </View>
          ) : null}
          {allTags.length > 0 ? (
            <View style={styles.chips}>
              {tagFilter ? (
                <Chip label={`#${displayTag(tagFilter)}`} active onPress={() => setTagFilter(null)} />
              ) : (
                allTags.slice(0, 8).map(({ tag, count }) => (
                  <Chip key={tag} label={`#${displayTag(tag)}`} count={count} onPress={() => setTagFilter(tag)} />
                ))
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Backdrop>
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={dayVersion}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.xl }]}
        ItemSeparatorComponent={() => <Rule />}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={10}
        windowSize={9}
        ListEmptyComponent={
          !loaded ? null : entries.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="Nothing saved yet"
              subtitle="Add something you don’t want to forget."
              actionLabel="Add"
              onAction={() => navigation.navigate('EntryEdit')}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle="Try a different search or clear filters."
              actionLabel="Clear"
              onAction={() => {
                setQuery('');
                setStatusFilter('all');
                setCategoryFilter(null);
                setTagFilter(null);
                setShowArchived(false);
              }}
            />
          )
        }
      />
      <ActionSheet
        visible={actionEntry !== null}
        title={actionEntry?.title ?? 'Idea'}
        onClose={() => setActionEntry(null)}
        actions={
          actionEntry
            ? [
                { label: 'Open', onPress: () => openEntry(actionEntry) },
                {
                  label: actionEntry.isFavorite ? 'Unfavourite' : 'Favourite',
                  onPress: () => toggleFavorite(actionEntry.id),
                },
                {
                  label: actionEntry.isPinned ? 'Unpin' : 'Pin',
                  onPress: () => updateEntry(actionEntry.id, { isPinned: !actionEntry.isPinned }),
                },
                {
                  label: 'Edit',
                  onPress: () => navigation.navigate('EntryEdit', { entryId: actionEntry.id }),
                },
                {
                  label: actionEntry.archivedAt ? 'Unarchive' : 'Archive',
                  onPress: () => {
                    updateEntry(actionEntry.id, { archivedAt: actionEntry.archivedAt ? null : Date.now() });
                    toast.show({ message: actionEntry.archivedAt ? 'Unarchived.' : 'Archived.' });
                  },
                },
                {
                  label: 'Delete',
                  destructive: true,
                  onPress: () => {
                    const snapshot = actionEntry;
                    deleteEntry(snapshot.id);
                    toast.show({
                      message: 'Deleted.',
                      tone: 'warning',
                      action: { label: 'Undo', onPress: () => restoreEntry(snapshot) },
                    });
                  },
                },
              ]
            : []
        }
      />
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: PAGE_PAD,
  },
  header: {
    gap: spacing.xl,
    paddingBottom: spacing.md,
  },
  brand: {
    gap: 6,
    paddingTop: spacing.xl,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -spacing.sm,
  },
  sort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filters: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
