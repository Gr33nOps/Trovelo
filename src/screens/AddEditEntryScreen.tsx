import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { TagInput } from '../components/TagInput';
import { PAGE_PAD, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { Category } from '../types';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Controls';
import { Field } from '../ui/Field';
import { NavBar, NavTextAction } from '../ui/NavBar';
import { Backdrop } from '../ui/Surface';
import { Type } from '../ui/Type';
import { fixGrammarAndStyle } from '../utils/grammar';

type Props = NativeStackScreenProps<RootStackParamList, 'EntryEdit'>;

const MAX_TEXT_LENGTH = 4000;
const MAX_TITLE_LENGTH = 90;
/** The counter only earns its place on screen once the limit is actually close. */
const COUNTER_THRESHOLD = 3500;

function tagCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'tag' : 'tags'}`;
}

function EntryDetailsSection({
  detailsOpen,
  onToggle,
  title,
  onChangeTitle,
  tags,
  onChangeTags,
  knownTags,
  categoryId,
  onChangeCategoryId,
  folderLabel,
  categories,
  showNewFolder,
  onToggleNewFolder,
  newFolder,
  onChangeNewFolder,
  onCreateFolder,
}: {
  readonly detailsOpen: boolean;
  readonly onToggle: () => void;
  readonly title: string;
  readonly onChangeTitle: (title: string) => void;
  readonly tags: string[];
  readonly onChangeTags: (tags: string[]) => void;
  readonly knownTags: string[];
  readonly categoryId: string | undefined;
  readonly onChangeCategoryId: (categoryId: string | undefined) => void;
  readonly folderLabel: string;
  readonly categories: Category[];
  readonly showNewFolder: boolean;
  readonly onToggleNewFolder: () => void;
  readonly newFolder: string;
  readonly onChangeNewFolder: (value: string) => void;
  readonly onCreateFolder: () => void;
}) {
  const { palette } = useTheme();
  const collapsedSummary = !detailsOpen && (title.trim() || tags.length > 0 || categoryId);

  return (
    <>
      <Pressable onPress={onToggle} style={styles.detailsToggle}>
        <Type role="label" pressed>
          {detailsOpen ? 'Hide details' : 'Add details'}
        </Type>
        <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={14} color={palette.inkFaint} />
        {collapsedSummary ? (
          <Type role="caption" color={palette.inkSoft} numberOfLines={1} style={styles.detailsSummary}>
            {[title.trim() || null, tags.length > 0 ? tagCountLabel(tags.length) : null, categoryId ? folderLabel : null]
              .filter(Boolean)
              .join(' · ')}
          </Type>
        ) : null}
      </Pressable>

      {detailsOpen ? (
        <>
          <View style={styles.detailBlock}>
            <Field
              value={title}
              onChangeText={onChangeTitle}
              label="Title"
              placeholder="Optional"
              maxLength={MAX_TITLE_LENGTH}
              returnKeyType="next"
              variant="plain"
            />
          </View>

          <View style={styles.detailBlock}>
            <Type role="label" pressed>
              Tags
            </Type>
            <TagInput value={tags} onChange={onChangeTags} suggestions={knownTags} />
          </View>

          <View style={styles.detailBlock}>
            <Type role="label" pressed>
              Folder
            </Type>
            <View style={styles.chipRow}>
              <Chip label="None" active={!categoryId} onPress={() => onChangeCategoryId(undefined)} />
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  active={categoryId === category.id}
                  onPress={() => onChangeCategoryId(category.id)}
                />
              ))}
              <Chip label={showNewFolder ? 'Cancel' : 'New folder'} active={false} onPress={onToggleNewFolder} />
            </View>

            {showNewFolder ? (
              <View style={styles.newFolderRow}>
                <Field
                  value={newFolder}
                  onChangeText={onChangeNewFolder}
                  placeholder="Folder name"
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={onCreateFolder}
                  containerStyle={styles.grow}
                  accessibilityLabel="New folder name"
                />
                <Button
                  label="Create"
                  size="md"
                  variant="primary"
                  disabled={newFolder.trim().length === 0}
                  onPress={onCreateFolder}
                />
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </>
  );
}

export default function AddEditEntryScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { entries, categories, tags: knownTags, addEntry, updateEntry, addCategory } = useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const entryId = route.params?.entryId;
  const existing = entryId ? entries.find((entry) => entry.id === entryId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [text, setText] = useState(existing?.text ?? route.params?.initialText ?? '');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId);
  const [newFolder, setNewFolder] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  // Tags and a folder are for later organising, not for capturing the thought
  // itself, so they stay tucked away until asked for.
  const [detailsOpen, setDetailsOpen] = useState(tags.length > 0 || !!categoryId);

  const saved = useRef(false);

  const dirty =
    title.trim() !== (existing?.title ?? '') ||
    text.trim() !== (existing?.text ?? '') ||
    categoryId !== existing?.categoryId ||
    tags.join(',') !== (existing?.tags ?? []).join(',');

  /**
   * Guards against losing work on a back swipe. Previously the screen just
   * unmounted and everything typed was gone with no warning.
   */
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!dirty || saved.current) return;
        event.preventDefault();
        Alert.alert(
          existing ? 'Discard your changes?' : 'Discard this?',
          'What you have written here will not be saved.',
          [
            { text: 'Keep editing', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => navigation.dispatch(event.data.action),
            },
          ],
        );
      }),
    [navigation, dirty, existing],
  );

  const canSave = text.trim().length > 0;

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    Keyboard.dismiss();
    saved.current = true;

    if (existing) {
      updateEntry(existing.id, {
        title: title.trim() || null,
        text: trimmed,
        tags,
        categoryId: categoryId ?? null,
      });
    } else {
      addEntry({
        title: title.trim() || undefined,
        text: trimmed,
        tags,
        status: 'new',
        categoryId,
      });
    }
    haptics.success();
    toast.show({ message: 'Saved.', tone: 'success' });
    navigation.goBack();
  };

  const fixGrammar = () => {
    const fixed = fixGrammarAndStyle(text);
    if (fixed === text.trim()) {
      toast.show({ message: 'Nothing to fix.' });
      return;
    }
    const original = text;
    setText(fixed.slice(0, MAX_TEXT_LENGTH));
    haptics.success();
    toast.show({
      message: 'Fixed.',
      action: { label: 'Undo', onPress: () => setText(original) },
    });
  };

  const createFolder = () => {
    try {
      const created = addCategory(newFolder);
      setCategoryId(created.id);
      setNewFolder('');
      setShowNewFolder(false);
      haptics.light();
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'That folder could not be created.',
        tone: 'warning',
      });
    }
  };

  const folderLabel = categoryId ? categories.find((c) => c.id === categoryId)?.name ?? 'None' : 'None';

  return (
    <Backdrop>
      <NavBar
        title={existing ? 'Edit idea' : ''}
        onBack={() => navigation.goBack()}
        backLabel="Cancel"
        borderless
        right={
          <NavTextAction label="Save" onPress={handleSave} disabled={!canSave} accent />
        }
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Field
            value={text}
            onChangeText={setText}
            label="Idea"
            placeholder="What's on your mind?"
            multiline
            maxLength={MAX_TEXT_LENGTH}
            showCounter={text.length > COUNTER_THRESHOLD}
            variant="plain"
            inputStyle={styles.textArea}
          />

          <Button
            label="Fix grammar"
            onPress={fixGrammar}
            variant="plain"
            size="sm"
            disabled={!canSave}
            icon={<Ionicons name="text-outline" size={14} color={palette.inkSoft} />}
            style={styles.polishButton}
          />

          <EntryDetailsSection
            detailsOpen={detailsOpen}
            onToggle={() => setDetailsOpen((open) => !open)}
            title={title}
            onChangeTitle={setTitle}
            tags={tags}
            onChangeTags={setTags}
            knownTags={knownTags.map((item) => item.tag)}
            categoryId={categoryId}
            onChangeCategoryId={setCategoryId}
            folderLabel={folderLabel}
            categories={categories}
            showNewFolder={showNewFolder}
            onToggleNewFolder={() => setShowNewFolder((open) => !open)}
            newFolder={newFolder}
            onChangeNewFolder={setNewFolder}
            onCreateFolder={createFolder}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  textArea: {
    minHeight: 180,
    fontSize: 19,
    lineHeight: 30,
    paddingHorizontal: 0,
  },
  polishButton: {
    alignSelf: 'flex-start',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  detailsSummary: {
    flexShrink: 1,
  },
  detailBlock: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
