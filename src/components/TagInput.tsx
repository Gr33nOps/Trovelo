import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { HIT_SLOP, radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Field } from '../ui/Field';
import { Type } from '../ui/Type';
import {
  MAX_TAGS_PER_ENTRY,
  MAX_TAG_LENGTH,
  addTag,
  displayTag,
  normalizeTag,
  removeTag,
} from '../utils/tags';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Existing tags across the library, offered as quick picks. */
  suggestions: string[];
}

export function TagInput({ value, onChange, suggestions }: Props) {
  const { palette } = useTheme();
  const [draft, setDraft] = useState('');

  const full = value.length >= MAX_TAGS_PER_ENTRY;

  const quickPicks = useMemo(() => {
    const query = normalizeTag(draft);
    return suggestions
      .filter((tag) => !value.includes(tag))
      .filter((tag) => (query ? tag.includes(query) : true))
      .slice(0, 6);
  }, [suggestions, value, draft]);

  const commit = (raw: string) => {
    const next = addTag(value, raw);
    if (next !== value) onChange(next);
    setDraft('');
  };

  return (
    <View style={styles.wrap}>
      {value.length > 0 ? (
        <View style={styles.chips}>
          {value.map((tag) => (
            <View
              key={tag}
              style={[
                styles.chip,
                {
                  borderRadius: radii.pill,
                  backgroundColor: withAlpha(palette.accent, 0.14),
                  borderColor: withAlpha(palette.accent, 0.4),
                },
              ]}
            >
              <Type role="caption" color={palette.accent} style={styles.chipLabel}>
                #{displayTag(tag)}
              </Type>
              <Pressable
                onPress={() => onChange(removeTag(value, tag))}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={`Remove tag ${displayTag(tag)}`}
              >
                <Ionicons name="close-circle" size={15} color={palette.accent} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Field
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => commit(draft)}
        placeholder={full ? `That's plenty of tags` : 'Add a tag'}
        editable={!full}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        maxLength={MAX_TAG_LENGTH}
        accessibilityLabel="Add a tag"
        left={<Ionicons name="pricetag-outline" size={16} color={palette.inkFaint} />}
        right={
          draft.trim() ? (
            <Pressable
              onPress={() => commit(draft)}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Add this tag"
            >
              <Ionicons name="add-circle" size={20} color={palette.accent} />
            </Pressable>
          ) : undefined
        }
      />

      {!full && quickPicks.length > 0 ? (
        <View style={styles.suggestions}>
          <Type role="caption" color={palette.inkFaint} style={styles.suggestLabel}>
            Used before:
          </Type>
          {quickPicks.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => commit(tag)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Add tag ${displayTag(tag)}`}
              style={({ pressed }) => [
                styles.suggestion,
                { borderRadius: radii.pill, borderColor: palette.edge, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Type role="caption" color={palette.inkSoft}>
                {displayTag(tag)}
              </Type>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipLabel: {
    fontWeight: '600',
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suggestLabel: {
    fontSize: 12,
  },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
