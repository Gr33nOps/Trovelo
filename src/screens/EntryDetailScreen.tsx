import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AiPanel } from '../components/AiPanel';
import { StatusBadge } from '../components/StatusBadge';
import { StatusPicker } from '../components/StatusPicker';
import { KIND_CONFIG } from '../constants/kinds';
import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useAiRunner } from '../hooks/useAiRunner';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { AiTaskId } from '../services/ai';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { EmptyState } from '../ui/EmptyState';
import { NavAction, NavBar, NavTextAction } from '../ui/NavBar';
import { Backdrop, Panel, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import { formatDate, formatRelativeDay } from '../utils/date';
import { findRelated } from '../utils/search';
import { addTag, displayTag, matchKnownTags, parseTags } from '../utils/tags';

const DAY_MS = 86_400_000;

type Props = NativeStackScreenProps<RootStackParamList, 'EntryDetail'>;

const DETAIL_TASKS: AiTaskId[] = ['summary', 'expand', 'spark', 'tags'];

export default function EntryDetailScreen({ navigation, route }: Props) {
  const { entryId } = route.params;
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const {
    entries,
    categories,
    tags: knownTags,
    updateEntry,
    deleteEntry,
    restoreEntry,
    setStatus,
    toggleFavorite,
    addFollowUp,
  } = useEntries();
  const haptics = useHaptics();
  const toast = useToast();
  const ai = useAiRunner();

  const [followUpText, setFollowUpText] = useState('');

  const entry = useMemo(() => entries.find((item) => item.id === entryId), [entries, entryId]);
  const folder = useMemo(
    () => categories.find((category) => category.id === entry?.categoryId),
    [categories, entry?.categoryId],
  );
  const related = useMemo(() => (entry ? findRelated(entries, entry) : []), [entries, entry]);

  const handleDelete = useCallback(() => {
    if (!entry) return;
    const snapshot = entry;
    deleteEntry(snapshot.id);
    haptics.warning();
    navigation.goBack();
    // An undo beats a confirmation dialog: nothing is lost, and the common
    // case (a deliberate delete) costs no extra tap.
    toast.show({
      message: `${KIND_CONFIG[snapshot.kind ?? 'idea'].label} deleted.`,
      tone: 'warning',
      action: { label: 'Undo', onPress: () => restoreEntry(snapshot) },
    });
  }, [entry, deleteEntry, restoreEntry, haptics, navigation, toast]);

  const applyAi = useCallback(
    (taskId: AiTaskId, output: string) => {
      if (!entry) return;
      if (taskId === 'tags') {
        const suggested = [...parseTags(output), ...matchKnownTags(entry.text, knownTags)];
        const next = suggested.reduce((tags, tag) => addTag(tags, tag), entry.tags);
        updateEntry(entry.id, { tags: next });
        toast.show({ message: 'Tags added.', tone: 'success' });
      }
      ai.reset();
    },
    [entry, knownTags, updateEntry, toast, ai],
  );

  const setReminder = useCallback(
    (offsetMs: number) => {
      if (!entry) return;
      updateEntry(entry.id, { remindAt: Date.now() + offsetMs });
      haptics.success();
      toast.show({ message: 'Got it. This will come back around then.', tone: 'success' });
    },
    [entry, updateEntry, haptics, toast],
  );

  const showRemindOptions = useCallback(() => {
    Alert.alert('Remind me later', 'When should this come back?', [
      { text: 'In a week', onPress: () => setReminder(7 * DAY_MS) },
      { text: 'In a month', onPress: () => setReminder(30 * DAY_MS) },
      { text: 'In 3 months', onPress: () => setReminder(90 * DAY_MS) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [setReminder]);

  const showMoreActions = useCallback(() => {
    if (!entry) return;
    haptics.medium();
    Alert.alert(entry.title ?? `This ${KIND_CONFIG[entry.kind ?? 'idea'].label.toLowerCase()}`, undefined, [
      {
        text: entry.isPinned ? 'Unpin' : 'Pin to top of library',
        onPress: () => updateEntry(entry.id, { isPinned: !entry.isPinned }),
      },
      { text: 'Remind me later', onPress: showRemindOptions },
      {
        text: entry.archivedAt ? 'Unarchive' : 'Archive',
        onPress: () => {
          updateEntry(entry.id, { archivedAt: entry.archivedAt ? null : Date.now() });
          toast.show({ message: entry.archivedAt ? 'Unarchived.' : 'Archived. Find it under the Archived filter.' });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [entry, haptics, updateEntry, showRemindOptions, toast]);

  const submitFollowUp = useCallback(() => {
    if (!entry || !followUpText.trim()) return;
    addFollowUp(entry.id, followUpText);
    setFollowUpText('');
    haptics.light();
  }, [entry, followUpText, addFollowUp, haptics]);

  if (!entry) {
    return (
      <Backdrop>
        <NavBar title="Entry" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="help-circle-outline"
          title="This entry is gone"
          subtitle="It may have been deleted from another screen."
          actionLabel="Back to the box"
          onAction={() => navigation.goBack()}
        />
      </Backdrop>
    );
  }

  const kindConfig = KIND_CONFIG[entry.kind ?? 'idea'];

  return (
    <Backdrop>
      <NavBar
        title={kindConfig.label}
        onBack={() => navigation.goBack()}
        borderless
        right={
          <>
            <NavAction
              icon={entry.isFavorite ? 'star' : 'star-outline'}
              label={entry.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              onPress={() => {
                toggleFavorite(entry.id);
                haptics.light();
              }}
            />
            <NavAction icon="ellipsis-horizontal" label="More actions" onPress={showMoreActions} />
            <NavTextAction
              label="Edit"
              onPress={() => navigation.navigate('EntryEdit', { entryId: entry.id })}
            />
          </>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Type role="label" color={palette.inkFaint}>
            {kindConfig.label}
          </Type>
          {entry.title ? (
            <Type role="title" pressed>
              {entry.title}
            </Type>
          ) : null}

          <Type role="title" style={styles.body} selectable>
            {entry.text}
          </Type>

          {entry.tags.length > 0 ? (
            <View style={styles.tags}>
              {entry.tags.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => navigation.navigate('MainTabs', { screen: 'Library', params: { tag } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Show entries tagged ${displayTag(tag)}`}
                  style={({ pressed }) => [
                    styles.tag,
                    {
                      borderRadius: radii.pill,
                      backgroundColor: withAlpha(palette.accent, 0.12),
                      borderColor: withAlpha(palette.accent, 0.35),
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                >
                  <Type role="caption" color={palette.accent} style={styles.tagLabel}>
                    #{displayTag(tag)}
                  </Type>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={[styles.meta, { borderTopColor: palette.edge }]}>
            <View style={styles.metaColumn}>
              <Type role="label" pressed>
                Saved
              </Type>
              <Type role="caption">{formatDate(entry.createdAt)}</Type>
            </View>
            {entry.kind === 'task' && entry.dueAt ? (
              <View style={styles.metaColumn}>
                <Type role="label" pressed>
                  Due
                </Type>
                <Type role="caption" color={entry.status !== 'done' && entry.dueAt < Date.now() ? palette.danger : undefined}>
                  {formatDate(entry.dueAt)}
                </Type>
              </View>
            ) : null}
            {entry.isPinned || entry.archivedAt ? (
              <View style={styles.metaColumn}>
                <Type role="label" pressed>
                  {entry.archivedAt ? 'Archived' : 'Pinned'}
                </Type>
                <Type role="caption">{entry.archivedAt ? formatDate(entry.archivedAt) : 'At the top of your library'}</Type>
              </View>
            ) : null}
            {entry.lastViewedAt ? (
              <View style={styles.metaColumn}>
                <Type role="label" pressed>
                  Last seen
                </Type>
                <Type role="caption">{formatRelativeDay(entry.lastViewedAt)}</Type>
              </View>
            ) : null}
            <View style={styles.metaColumn}>
              <Type role="label" pressed>
                Rediscovered
              </Type>
              <Type role="caption">
                {entry.timesRediscovered} {entry.timesRediscovered === 1 ? 'time' : 'times'}
              </Type>
            </View>
          </View>
        </View>

        <Panel style={styles.card} borderRadius={radii.lg}>
          <View style={styles.statusHeader}>
            <Type role="label" pressed>
              Status
            </Type>
            <StatusBadge status={entry.status} />
          </View>
          <StatusPicker value={entry.status} onChange={(status) => setStatus(entry.id, status)} />
          {folder ? (
            <View style={styles.folderRow}>
              <Ionicons name="folder-outline" size={15} color={palette.inkFaint} />
              <Type role="caption">{folder.name}</Type>
            </View>
          ) : null}
        </Panel>

        <View style={styles.section}>
          <Type role="label" pressed style={styles.sectionLabel}>
            Look at it differently
          </Type>
          <AiPanel
            runner={ai}
            tasks={DETAIL_TASKS}
            onRun={(taskId) =>
              void ai.run(
                taskId,
                entry.text,
                knownTags.map((item) => item.tag),
              )
            }
            onApply={applyAi}
            // Only the tag suggestions change the entry; the rest are for reading.
            applyLabel={(taskId) => (taskId === 'tags' ? 'Add these tags' : null)}
            onOpenSettings={() => navigation.navigate('Models')}
          />
        </View>

        <Panel style={styles.card} borderRadius={radii.lg}>
          <Type role="label" pressed>
            Later thoughts
          </Type>
          {entry.followUps && entry.followUps.length > 0 ? (
            <View style={styles.followUps}>
              {entry.followUps.map((followUp) => (
                <View key={followUp.id} style={styles.followUpRow}>
                  <Type role="caption" color={palette.inkFaint} style={styles.followUpDate}>
                    {formatDate(followUp.at)}
                  </Type>
                  <Type role="body" style={styles.followUpText}>
                    {followUp.text}
                  </Type>
                </View>
              ))}
            </View>
          ) : (
            <Type role="caption">Add a short note here later, without editing what you first wrote.</Type>
          )}
          <View style={styles.followUpInput}>
            <Field
              value={followUpText}
              onChangeText={setFollowUpText}
              placeholder="Add a thought"
              maxLength={280}
              returnKeyType="done"
              onSubmitEditing={submitFollowUp}
              containerStyle={styles.grow}
              accessibilityLabel="Add a follow-up thought"
            />
            <Button
              label="Add"
              size="md"
              variant="secondary"
              disabled={followUpText.trim().length === 0}
              onPress={submitFollowUp}
            />
          </View>
        </Panel>

        {related.length > 0 ? (
          <View style={styles.section}>
            <Type role="label" pressed style={styles.sectionLabel}>
              Related
            </Type>
            <Panel style={styles.card} borderRadius={radii.lg}>
              {related.map((item, index) => (
                <View key={item.id}>
                  {index > 0 ? <Rule /> : null}
                  <Pressable
                    onPress={() => navigation.navigate('EntryDetail', { entryId: item.id })}
                    accessibilityRole="button"
                    accessibilityLabel={item.title ?? item.text.slice(0, 60)}
                    style={({ pressed }) => [styles.relatedRow, { opacity: pressed ? 0.65 : 1 }]}
                  >
                    <Ionicons name={KIND_CONFIG[item.kind ?? 'idea'].icon} size={15} color={palette.inkFaint} />
                    <View style={styles.relatedText}>
                      <Type role="bodyStrong" numberOfLines={1}>
                        {item.title ?? item.text}
                      </Type>
                      <Type role="caption" numberOfLines={1} color={palette.inkFaint}>
                        {item.text}
                      </Type>
                    </View>
                    <Ionicons name="chevron-forward" size={15} color={palette.inkFaint} />
                  </Pressable>
                </View>
              ))}
            </Panel>
          </View>
        ) : null}

        <View style={styles.footerActions}>
          <Button
            label="Share"
            variant="secondary"
            size="md"
            style={styles.grow}
            icon={<Ionicons name="share-outline" size={16} color={palette.ink} />}
            onPress={() =>
              void Share.share({
                message: entry.title ? `${entry.title}\n\n${entry.text}` : entry.text,
              }).catch(() => {})
            }
          />
          <Button
            label="Edit"
            variant="primary"
            size="md"
            style={styles.grow}
            onPress={() => navigation.navigate('EntryEdit', { entryId: entry.id })}
          />
        </View>

        <Button
          label={`Delete ${kindConfig.label.toLowerCase()}`}
          variant="danger"
          size="md"
          fullWidth
          haptic={false}
          onPress={handleDelete}
        />
      </ScrollView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  card: {
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  body: {
    fontWeight: '400',
    lineHeight: 36,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagLabel: {
    fontWeight: '600',
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaColumn: {
    gap: 2,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    paddingHorizontal: spacing.xs,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
  followUps: {
    gap: spacing.sm,
  },
  followUpRow: {
    gap: 2,
  },
  followUpDate: {
    fontSize: 12,
  },
  followUpText: {
    lineHeight: 22,
  },
  followUpInput: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  relatedText: {
    flex: 1,
    gap: 1,
  },
});
