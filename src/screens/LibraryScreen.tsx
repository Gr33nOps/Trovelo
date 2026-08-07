import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskBoxPanel } from '../components/AskBoxPanel';
import { EntryCard } from '../components/EntryCard';
import { KIND_CONFIG, KIND_ORDER } from '../constants/kinds';
import { STATUS_FILTER_OPTIONS } from '../constants/status';
import { HIT_SLOP, PAGE_PAD, fonts, fontSizes, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useDebouncedValue } from '../hooks/useDebounce';
import { DictationDenial, useDictation } from '../hooks/useDictation';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { Entry, EntryKind, SortOrder, StatusFilter } from '../types';
import { Button } from '../ui/Button';
import { Chip, IconButton, TextTab } from '../ui/Controls';
import { EmptyState } from '../ui/EmptyState';
import { Backdrop, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import { searchEntries } from '../utils/search';
import { displayTag } from '../utils/tags';

type KindFilter = 'all' | EntryKind | 'archived';
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
  const [showFilters, setShowFilters] = useState(false);

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
              ? 'Voice input needs a speech pack. Get it in Settings.'
              : "No speech recognizer installed. Switch to the offline pack in Settings.",
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
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const keptCount = useMemo(() => entries.filter((e) => !e.archivedAt).length, [entries]);

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
  }, [entries, debouncedQuery, statusFilter, categoryFilter, tagFilter, kindFilter, sort]);

  const openEntry = useCallback(
    (entry: Entry) => navigation.navigate('EntryDetail', { entryId: entry.id }),
    [navigation],
  );

  const showActions = useCallback(
    (entry: Entry) => {
      haptics.medium();
      Alert.alert(entry.title ?? KIND_CONFIG[entry.kind ?? 'idea'].label, undefined, [
        { text: 'Open', onPress: () => openEntry(entry) },
        {
          text: entry.isFavorite ? 'Unfavourite' : 'Favourite',
          onPress: () => toggleFavorite(entry.id),
        },
        {
          text: entry.isPinned ? 'Unpin' : 'Pin',
          onPress: () => updateEntry(entry.id, { isPinned: !entry.isPinned }),
        },
        { text: 'Edit', onPress: () => navigation.navigate('EntryEdit', { entryId: entry.id }) },
        {
          text: entry.archivedAt ? 'Unarchive' : 'Archive',
          onPress: () => {
            updateEntry(entry.id, { archivedAt: entry.archivedAt ? null : Date.now() });
            toast.show({ message: entry.archivedAt ? 'Unarchived.' : 'Archived.' });
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteEntry(entry.id);
            toast.show({
              message: 'Deleted.',
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

  const renderItem = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryCard
        entry={item}
        folderName={item.categoryId ? folderNames.get(item.categoryId) : undefined}
        onPress={() => openEntry(item)}
        onLongPress={() => showActions(item)}
        onToggleDone={
          item.kind === 'task'
            ? () => {
                haptics.light();
                setStatus(item.id, item.status === 'done' ? 'new' : 'done');
              }
            : undefined
        }
      />
    ),
    [folderNames, openEntry, showActions, haptics, setStatus],
  );

  const activeExtra =
    (statusFilter !== 'all' ? 1 : 0) + (categoryFilter ? 1 : 0) + (tagFilter ? 1 : 0) + (kindFilter === 'archived' ? 1 : 0);

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
        {dictation.supported ? (
          <IconButton
            icon={dictation.listening ? 'stop-circle' : 'mic-outline'}
            label={dictation.listening ? 'Stop' : 'Voice search'}
            size={20}
            active={dictation.listening}
            onPress={() => void dictation.toggle('')}
          />
        ) : null}
        {query ? <IconButton icon="close-circle" label="Clear" size={20} onPress={() => setQuery('')} /> : null}
        <IconButton
          icon="chatbubble-ellipses-outline"
          label="Ask"
          size={20}
          active={showAsk}
          onPress={() => setShowAsk((v) => !v)}
        />
      </View>

      {showAsk ? (
        <AskBoxPanel
          entries={entries}
          onOpenEntry={(id) => navigation.navigate('EntryDetail', { entryId: id })}
          onOpenSettings={() => navigation.navigate('Models')}
        />
      ) : null}

      <View style={styles.tabs} accessibilityRole="tablist">
        <TextTab label="All" active={kindFilter === 'all'} onPress={() => setKindFilter('all')} />
        {KIND_ORDER.map((k) => (
          <TextTab
            key={k}
            label={KIND_CONFIG[k].pickerLabel}
            active={kindFilter === k}
            onPress={() => setKindFilter(k)}
          />
        ))}
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
            <Chip label="Archived" active={kindFilter === 'archived'} onPress={() => setKindFilter('archived')} />
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
                setKindFilter('all');
              }}
            />
          )
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
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginTop: -spacing.sm,
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
