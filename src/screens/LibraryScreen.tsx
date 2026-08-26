import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMark } from '../components/AppMark';
import { EntryCard } from '../components/EntryCard';
import { STATUS_FILTER_OPTIONS } from '../constants/status';
import { HIT_SLOP, PAGE_PAD, Palette, radius as radii, fonts, fontSizes, spacing, withAlpha } from '../constants/theme';
import { TagCount, useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useDebouncedValue } from '../hooks/useDebounce';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { Category, Entry, SortOrder, StatusFilter } from '../types';
import { ActionSheet, ActionSheetItem } from '../ui/ActionSheet';
import { Chip, IconButton } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { Backdrop, Rule, Well } from '../ui/Surface';
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

function ItemSeparator() {
  return <Rule />;
}

function filterSummaryLabel(activeExtra: number, filteredCount: number, hasQuery: boolean): string {
  if (activeExtra > 0) {
    return `${filteredCount} shown · ${activeExtra} ${activeExtra === 1 ? 'filter' : 'filters'}`;
  }
  if (hasQuery) return `${filteredCount} shown`;
  return 'Filter';
}

/** Below this many ideas, filtering/sorting is noise rather than a useful tool. */
const MIN_ENTRIES_FOR_TOOLBAR = 5;

function LibraryHeader({
  palette,
  insetsTop,
  keptCount,
  totalCount,
  query,
  onChangeQuery,
  showFilters,
  onToggleFilters,
  activeExtra,
  filteredCount,
  hasQuery,
  sort,
  onCycleSort,
  showArchived,
  onToggleArchived,
  statusFilter,
  onChangeStatusFilter,
  categories,
  categoryFilter,
  onChangeCategoryFilter,
  allTags,
  tagFilter,
  onChangeTagFilter,
}: {
  readonly palette: Palette;
  readonly insetsTop: number;
  readonly keptCount: number;
  readonly totalCount: number;
  readonly query: string;
  readonly onChangeQuery: (value: string) => void;
  readonly showFilters: boolean;
  readonly onToggleFilters: () => void;
  readonly activeExtra: number;
  readonly filteredCount: number;
  readonly hasQuery: boolean;
  readonly sort: SortOrder;
  readonly onCycleSort: () => void;
  readonly showArchived: boolean;
  readonly onToggleArchived: () => void;
  readonly statusFilter: StatusFilter;
  readonly onChangeStatusFilter: (value: StatusFilter) => void;
  readonly categories: Category[];
  readonly categoryFilter: string | null;
  readonly onChangeCategoryFilter: (value: string | null) => void;
  readonly allTags: TagCount[];
  readonly tagFilter: string | null;
  readonly onChangeTagFilter: (value: string | null) => void;
}) {
  const showToolbar = totalCount >= MIN_ENTRIES_FOR_TOOLBAR;

  return (
    <View style={styles.header}>
      <View style={{ height: insetsTop }} />

      <View style={styles.brand}>
        <AppMark size={40} />
        <View style={styles.brandText}>
          <Type role="display" accessibilityRole="header">
            Trovelo
          </Type>
          <Type role="caption" color={palette.inkFaint}>
            {keptCount} {keptCount === 1 ? 'idea' : 'ideas'} saved
          </Type>
        </View>
      </View>

      <Well style={styles.search} borderRadius={radii.md}>
        <Ionicons name="search-outline" size={17} color={palette.inkFaint} />
        <TextInput
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search your ideas"
          placeholderTextColor={palette.inkFaint}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search"
          selectionColor={palette.accent}
          cursorColor={palette.accent}
          style={[styles.searchInput, { color: palette.ink, fontFamily: fonts.body, fontSize: fontSizes.md }]}
        />
        {query ? <IconButton icon="close-circle" label="Clear" size={18} onPress={() => onChangeQuery('')} /> : null}
      </Well>

      {showToolbar ? (
        <>
          <View style={styles.toolbar}>
            <Pressable
              onPress={onToggleFilters}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Filters"
              style={[
                styles.toolbarButton,
                { borderRadius: radii.pill, backgroundColor: showFilters || activeExtra > 0 ? withAlpha(palette.ink, 0.06) : 'transparent' },
              ]}
            >
              <Ionicons name="options-outline" size={14} color={palette.inkSoft} />
              <Type role="caption" color={palette.inkSoft}>
                {filterSummaryLabel(activeExtra, filteredCount, hasQuery)}
              </Type>
            </Pressable>
            <Pressable
              onPress={onCycleSort}
              hitSlop={HIT_SLOP}
              style={[styles.toolbarButton, { borderRadius: radii.pill }]}
              accessibilityRole="button"
              accessibilityLabel={`Sort: ${SORT_LABELS[sort]}`}
            >
              <Ionicons name="swap-vertical" size={14} color={palette.inkSoft} />
              <Type role="caption" color={palette.inkSoft}>
                {SORT_LABELS[sort]}
              </Type>
            </Pressable>
          </View>

          {showFilters ? (
            <View style={styles.filters}>
              <View style={styles.chips}>
                <Chip label="Archived" active={showArchived} onPress={onToggleArchived} />
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <Chip
                    key={o.value}
                    label={o.label}
                    active={statusFilter === o.value}
                    onPress={() => onChangeStatusFilter(o.value)}
                  />
                ))}
              </View>
              {categories.length > 0 ? (
                <View style={styles.chips}>
                  <Chip label="All folders" active={categoryFilter === null} onPress={() => onChangeCategoryFilter(null)} />
                  <Chip label="Loose" active={categoryFilter === 'none'} onPress={() => onChangeCategoryFilter('none')} />
                  {categories.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      active={categoryFilter === c.id}
                      onPress={() => onChangeCategoryFilter(c.id)}
                    />
                  ))}
                </View>
              ) : null}
              {allTags.length > 0 ? (
                <View style={styles.chips}>
                  {tagFilter ? (
                    <Chip label={`#${displayTag(tagFilter)}`} active onPress={() => onChangeTagFilter(null)} />
                  ) : (
                    allTags.slice(0, 8).map(({ tag, count }) => (
                      <Chip key={tag} label={`#${displayTag(tag)}`} count={count} onPress={() => onChangeTagFilter(tag)} />
                    ))
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Bounds the list area with a rule so even a single row reads as
          part of a list, not text floating on the page. */}
      <Rule />
    </View>
  );
}

function buildEntryActions(
  entry: Entry,
  handlers: {
    readonly onOpen: () => void;
    readonly onToggleFavorite: () => void;
    readonly onTogglePin: () => void;
    readonly onEdit: () => void;
    readonly onToggleArchive: () => void;
    readonly onDelete: () => void;
  },
): ActionSheetItem[] {
  return [
    { label: 'Open', onPress: handlers.onOpen },
    { label: entry.isFavorite ? 'Unfavourite' : 'Favourite', onPress: handlers.onToggleFavorite },
    { label: entry.isPinned ? 'Unpin' : 'Pin', onPress: handlers.onTogglePin },
    { label: 'Edit', onPress: handlers.onEdit },
    { label: entry.archivedAt ? 'Unarchive' : 'Archive', onPress: handlers.onToggleArchive },
    { label: 'Delete', destructive: true, onPress: handlers.onDelete },
  ];
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

    matches.sort((a, b) => {
      const left = sortKey(a, sort);
      const right = sortKey(b, sort);
      if (typeof left === 'string' || typeof right === 'string') {
        return String(left).localeCompare(String(right));
      }
      return left - right;
    });
    const pinned = matches.filter((e) => e.isPinned);
    const rest = matches.filter((e) => !e.isPinned);
    return pinned.length ? [...pinned, ...rest] : matches;
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
    <LibraryHeader
      palette={palette}
      insetsTop={insets.top}
      keptCount={keptCount}
      totalCount={entries.length}
      query={query}
      onChangeQuery={setQuery}
      showFilters={showFilters}
      onToggleFilters={() => setShowFilters((v) => !v)}
      activeExtra={activeExtra}
      filteredCount={filtered.length}
      hasQuery={Boolean(debouncedQuery.trim())}
      sort={sort}
      onCycleSort={() => {
        haptics.light();
        setSort((s) => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]);
      }}
      showArchived={showArchived}
      onToggleArchived={() => setShowArchived((v) => !v)}
      statusFilter={statusFilter}
      onChangeStatusFilter={setStatusFilter}
      categories={categories}
      categoryFilter={categoryFilter}
      onChangeCategoryFilter={setCategoryFilter}
      allTags={allTags}
      tagFilter={tagFilter}
      onChangeTagFilter={setTagFilter}
    />
  );

  let listEmptyComponent: React.ReactNode = null;
  if (loaded) {
    listEmptyComponent =
      entries.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="Nothing saved yet"
          subtitle="Add an idea you don’t want to forget."
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
      );
  }

  return (
    <Backdrop>
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        extraData={dayVersion}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.xl }]}
        ItemSeparatorComponent={ItemSeparator}
        ListFooterComponent={filtered.length > 0 ? ItemSeparator : undefined}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={10}
        windowSize={9}
        ListEmptyComponent={listEmptyComponent}
      />
      <ActionSheet
        visible={actionEntry !== null}
        title={actionEntry?.title ?? 'Idea'}
        onClose={() => setActionEntry(null)}
        actions={
          actionEntry
            ? buildEntryActions(actionEntry, {
                onOpen: () => openEntry(actionEntry),
                onToggleFavorite: () => toggleFavorite(actionEntry.id),
                onTogglePin: () => updateEntry(actionEntry.id, { isPinned: !actionEntry.isPinned }),
                onEdit: () => navigation.navigate('EntryEdit', { entryId: actionEntry.id }),
                onToggleArchive: () => {
                  updateEntry(actionEntry.id, { archivedAt: actionEntry.archivedAt ? null : Date.now() });
                  toast.show({ message: actionEntry.archivedAt ? 'Unarchived.' : 'Archived.' });
                },
                onDelete: () => {
                  const snapshot = actionEntry;
                  deleteEntry(snapshot.id);
                  toast.show({
                    message: 'Deleted.',
                    tone: 'warning',
                    action: { label: 'Undo', onPress: () => restoreEntry(snapshot) },
                  });
                },
              })
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  brandText: {
    flex: 1,
    gap: 6,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
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
