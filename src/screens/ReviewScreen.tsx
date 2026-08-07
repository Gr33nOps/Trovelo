import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { StatusPicker } from '../components/StatusPicker';
import { SurpriseCard } from '../components/SurpriseCard';
import { radius as radii, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { EntryStatus } from '../types';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

const REVIEW_SIZE = 5;

/**
 * A short, deliberate pass through the entries that have waited longest,
 * rather than the random resurfacing "Surprise Me" does. The queue is a
 * one-time snapshot taken when the screen opens, so triaging one entry never
 * reshuffles the rest mid-session.
 */
export default function ReviewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { entries, categories, setStatus, toggleFavorite, recordViewed } = useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const [queueIds] = useState<string[]>(() =>
    entries
      .filter((entry) => entry.kind !== 'task' && !entry.archivedAt && entry.status !== 'not_useful')
      .sort((a, b) => (a.lastViewedAt ?? a.createdAt) - (b.lastViewedAt ?? b.createdAt))
      .slice(0, REVIEW_SIZE)
      .map((entry) => entry.id),
  );
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);

  const current = index < queueIds.length ? entries.find((entry) => entry.id === queueIds[index]) : undefined;

  // An entry deleted elsewhere mid-review should not leave the screen stuck.
  useEffect(() => {
    if (index < queueIds.length && !current) setIndex((value) => value + 1);
  }, [index, queueIds.length, current]);

  const folderName = current?.categoryId
    ? categories.find((category) => category.id === current.categoryId)?.name
    : undefined;

  const advance = () => {
    if (!current) return;
    recordViewed(current.id);
    setReviewed((value) => value + 1);
    haptics.light();
    setIndex((value) => value + 1);
  };

  const handleStatus = (status: EntryStatus) => {
    if (!current) return;
    setStatus(current.id, status);
    haptics.light();
    if (status === 'not_useful') {
      toast.show({ message: 'Kept, but it will stop turning up in surprises.' });
    }
  };

  if (queueIds.length === 0) {
    return (
      <Backdrop>
        <NavBar title="Weekly review" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing to review yet"
          subtitle="Once you have saved a few entries, this is where you can work through the ones you have not seen in a while."
          actionLabel="Back to the box"
          onAction={() => navigation.goBack()}
        />
      </Backdrop>
    );
  }

  if (index >= queueIds.length) {
    return (
      <Backdrop>
        <NavBar title="Weekly review" onBack={() => navigation.goBack()} />
        <View style={styles.doneWrap}>
          <EmptyState
            icon="checkmark-done-outline"
            title="All caught up"
            subtitle={`You went through ${reviewed} ${reviewed === 1 ? 'entry' : 'entries'}.`}
            actionLabel="Done"
            onAction={() => navigation.goBack()}
          />
        </View>
      </Backdrop>
    );
  }

  if (!current) {
    // The entry at this index was deleted from elsewhere; the effect above
    // is about to advance past it. This shows for at most one frame, but a
    // spinner beats a screen with a header and nothing else in it.
    return (
      <Backdrop>
        <NavBar title="Weekly review" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <NavBar
        title="Weekly review"
        subtitle={`${index + 1} of ${queueIds.length}`}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <SurpriseCard
          entry={current}
          folderName={folderName}
          onToggleFavorite={() => {
            toggleFavorite(current.id);
            haptics.light();
          }}
        />

        <Panel style={styles.actionPanel} borderRadius={radii.lg}>
          <Type role="label" pressed>
            How does it look now?
          </Type>
          <StatusPicker value={current.status} onChange={handleStatus} hideNew />

          <View style={styles.actionRow}>
            <Button
              label="Open"
              onPress={() => navigation.navigate('EntryDetail', { entryId: current.id })}
              variant="secondary"
              size="md"
              style={styles.grow}
              icon={<Ionicons name="open-outline" size={16} color={palette.ink} />}
            />
            <Button
              label={index + 1 === queueIds.length ? 'Finish' : 'Next'}
              onPress={advance}
              variant="primary"
              size="md"
              haptic="medium"
              style={styles.grow}
              icon={<Ionicons name="arrow-forward" size={16} color={palette.accentInk} />}
            />
          </View>
        </Panel>
      </ScrollView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
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
  doneWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
