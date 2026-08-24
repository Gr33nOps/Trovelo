import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TagInput } from '../components/TagInput';
import { radius as radii, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'Tidy'>;

/**
 * Walks every untagged entry once, letting the user add tags to each one and
 * skip the rest. The queue is a snapshot taken on open so tagging one entry
 * does not shift the rest.
 */
export default function TidyScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { entries, tags: allTags, updateEntry } = useEntries();
  const haptics = useHaptics();

  const [queueIds] = useState<string[]>(() =>
    entries.filter((entry) => entry.tags.length === 0 && !entry.archivedAt).map((entry) => entry.id),
  );
  const [index, setIndex] = useState(0);
  const [tagged, setTagged] = useState(0);
  const [pendingTags, setPendingTags] = useState<string[]>([]);

  const current = index < queueIds.length ? entries.find((entry) => entry.id === queueIds[index]) : undefined;

  useEffect(() => {
    if (index < queueIds.length && !current) setIndex((value) => value + 1);
  }, [index, queueIds.length, current]);

  useEffect(() => {
    setPendingTags([]);
  }, [current?.id]);

  const advance = () => setIndex((value) => value + 1);

  const acceptTags = () => {
    if (!current || pendingTags.length === 0) return;
    updateEntry(current.id, { tags: pendingTags });
    setTagged((value) => value + 1);
    haptics.success();
    advance();
  };

  const skip = () => {
    haptics.light();
    advance();
  };

  if (queueIds.length === 0) {
    return (
      <Backdrop>
        <NavBar title="Tidy up" onBack={() => navigation.goBack()} />
        <EmptyState
          icon="sparkles-outline"
          title="Nothing to tidy"
          subtitle="Everything in your box already has at least one tag."
          actionLabel="Back to the box"
          onAction={() => navigation.goBack()}
        />
      </Backdrop>
    );
  }

  if (index >= queueIds.length) {
    return (
      <Backdrop>
        <NavBar title="Tidy up" onBack={() => navigation.goBack()} />
        <View style={styles.doneWrap}>
          <EmptyState
            icon="checkmark-done-outline"
            title="All tidy"
            subtitle={`${tagged} of ${queueIds.length} tagged.`}
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
        <NavBar title="Tidy up" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Backdrop>
    );
  }

  return (
    <Backdrop>
      <NavBar title="Tidy up" subtitle={`${index + 1} of ${queueIds.length}`} onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <Panel style={styles.card} borderRadius={radii.lg}>
          {current.title ? (
            <Type role="bodyStrong" pressed numberOfLines={2}>
              {current.title}
            </Type>
          ) : null}
          <Type role="body" numberOfLines={6} color={current.title ? palette.inkSoft : palette.ink}>
            {current.text}
          </Type>
        </Panel>

        <Panel style={styles.card} borderRadius={radii.lg}>
          <Type role="label" pressed>
            Tags
          </Type>
          <TagInput
            key={current.id}
            value={pendingTags}
            onChange={setPendingTags}
            suggestions={allTags.map((item) => item.tag)}
          />
        </Panel>

        <View style={styles.actionRow}>
          <Button label="Skip" onPress={skip} variant="secondary" size="md" style={styles.grow} />
          <Button
            label="Add tags"
            onPress={acceptTags}
            variant="primary"
            size="md"
            haptic="success"
            disabled={pendingTags.length === 0}
            style={styles.grow}
          />
        </View>
      </ScrollView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
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
