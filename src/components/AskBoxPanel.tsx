import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useAskBox } from '../hooks/useAskBox';
import { AskBoxSource } from '../services/ai';
import { Entry } from '../types';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Controls';
import { Field } from '../ui/Field';
import { Panel, Well } from '../ui/Surface';
import { Type } from '../ui/Type';

interface Props {
  entries: Entry[];
  onOpenEntry: (entryId: string) => void;
  onOpenSettings: () => void;
}

const MAX_SOURCES = 6;

const QUESTION_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'do',
  'does',
  'for',
  'from',
  'have',
  'i',
  'in',
  'is',
  'me',
  'my',
  'of',
  'on',
  'or',
  'relate',
  'related',
  'show',
  'that',
  'the',
  'to',
  'what',
  'which',
  'with',
]);

function words(text: string): string[] {
  return (text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}']+/gu) ?? []).filter(
    (word) => word.length > 1 && !QUESTION_WORDS.has(word),
  );
}

function sourceScore(entry: Entry, queryWords: readonly string[]): number {
  const title = (entry.title ?? '').normalize('NFKC').toLowerCase();
  const body = entry.text.normalize('NFKC').toLowerCase();
  const tags = entry.tags.map((tag) => tag.normalize('NFKC').toLowerCase());
  let score = 0;
  let matches = 0;

  for (const word of queryWords) {
    const variants = word.endsWith('s') && word.length > 3 ? [word, word.slice(0, -1)] : [word];
    const inTitle = variants.some((candidate) => title.includes(candidate));
    const inTag = variants.some((candidate) => tags.some((tag) => tag.includes(candidate)));
    const inBody = variants.some((candidate) => body.includes(candidate));
    if (!inTitle && !inTag && !inBody) continue;
    matches += 1;
    score += inTitle ? 6 : inTag ? 5 : 2;
  }

  return matches === 0 ? 0 : score + (matches / queryWords.length) * 4;
}

/**
 * A question box that keyword-prefilters the library down to a handful of
 * likely notes and only sends those to the model. There is no embedding
 * index behind this, so it costs nothing extra to ship and stays honest when
 * nothing matches instead of inventing an answer.
 */
export function AskBoxPanel({ entries, onOpenEntry, onOpenSettings }: Props) {
  const { palette } = useTheme();
  const runner = useAskBox();
  const [question, setQuestion] = useState('');
  const [noMatch, setNoMatch] = useState(false);

  const ask = () => {
    const trimmed = question.trim();
    if (!trimmed || runner.running) return;
    setNoMatch(false);

    const queryWords = words(trimmed);
    if (queryWords.length === 0) {
      setNoMatch(true);
      runner.reset();
      return;
    }
    const scored = entries
      .filter((entry) => !entry.archivedAt)
      .map((entry) => ({ entry, score: sourceScore(entry, queryWords) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SOURCES);

    if (scored.length === 0) {
      setNoMatch(true);
      runner.reset();
      return;
    }

    const sources: AskBoxSource[] = scored.map((item) => ({
      id: item.entry.id,
      title: item.entry.title,
      text: item.entry.text,
    }));
    void runner.ask(trimmed, sources);
  };

  if (runner.availability === 'disabled' || runner.availability === 'no-model') {
    return (
      <Panel style={styles.card} borderRadius={radii.lg}>
        <View style={styles.offHeader}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.inkFaint} />
          <Type role="bodyStrong" pressed>
            Ask your box
          </Type>
        </View>
        <Type role="caption">
          {runner.availability === 'disabled'
            ? 'Ask a question and the assistant will look through what you have saved. Needs the local assistant turned on.'
            : 'The assistant is on but has no model yet.'}
        </Type>
        <Button
          label={runner.availability === 'disabled' ? 'Set up the assistant' : 'Choose a model'}
          variant="secondary"
          size="sm"
          onPress={onOpenSettings}
        />
      </Panel>
    );
  }

  return (
    <Panel style={styles.card} borderRadius={radii.lg}>
      <View style={styles.offHeader}>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={palette.inkFaint} />
        <Type role="bodyStrong" pressed>
          Ask your box
        </Type>
      </View>

      <Field
        value={question}
        onChangeText={(value) => {
          setQuestion(value);
          setNoMatch(false);
        }}
        placeholder="What tasks relate to my project?"
        maxLength={500}
        returnKeyType="search"
        onSubmitEditing={ask}
        editable={!runner.running}
        right={
          <Button
            label={runner.running ? 'Asking' : 'Ask'}
            onPress={ask}
            variant="primary"
            size="sm"
            loading={runner.running}
            disabled={!question.trim() || runner.running}
          />
        }
      />

      {noMatch ? (
        <Type role="caption" color={palette.inkFaint}>
          Nothing in your box seems to match that yet.
        </Type>
      ) : null}

      {runner.error ? (
        <View style={[styles.error, { borderRadius: radii.md, backgroundColor: withAlpha(palette.danger, 0.12) }]}>
          <Ionicons name="alert-circle-outline" size={16} color={palette.danger} />
          <Type role="caption" color={palette.danger} style={styles.errorText}>
            {runner.error}
          </Type>
        </View>
      ) : null}

      {runner.answer || runner.running ? (
        <Well style={styles.output} borderRadius={radii.lg}>
          <View style={styles.outputHeader}>
            <Type role="label" pressed>
              Answer
            </Type>
            {runner.running ? <ActivityIndicator size="small" color={palette.accent} /> : null}
          </View>

          <Type role="body" style={styles.outputText}>
            {runner.answer || 'Reading your notes…'}
          </Type>

          {!runner.running && runner.usedIds.length > 0 ? (
            <View style={styles.sources}>
              {runner.usedIds.map((id) => {
                const source = entries.find((entry) => entry.id === id);
                if (!source) return null;
                return (
                  <Chip
                    key={id}
                    label={source.title ?? source.text.slice(0, 28)}
                    onPress={() => onOpenEntry(id)}
                  />
                );
              })}
            </View>
          ) : null}

          <View style={styles.outputActions}>
            {runner.running ? (
              <Button label="Stop" variant="secondary" size="sm" onPress={runner.cancel} />
            ) : (
              <Button label="Done" variant="plain" size="sm" onPress={runner.reset} />
            )}
          </View>
        </Well>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  offHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
  },
  output: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  outputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  outputText: {
    lineHeight: 24,
  },
  sources: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  outputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
