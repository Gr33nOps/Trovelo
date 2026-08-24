import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
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
      toast.show({ message: 'Saved.', tone: 'success' });
    } else {
      addEntry({
        title: title.trim() || undefined,
        text: trimmed,
        tags,
        status: 'new',
        categoryId,
      });
      toast.show({ message: 'Added to your box.', tone: 'success' });
    }
    haptics.success();
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
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          <Field
            value={title}
            onChangeText={setTitle}
            placeholder="Title (optional)"
            maxLength={MAX_TITLE_LENGTH}
            returnKeyType="next"
            variant="plain"
            containerStyle={styles.titleField}
          />

          <Field
            value={text}
            onChangeText={setText}
            placeholder="A half-formed thought, a what-if, a thing worth trying..."
            multiline
            maxLength={MAX_TEXT_LENGTH}
            showCounter
            variant="plain"
            inputStyle={styles.textArea}
            containerStyle={styles.bodyField}
          />

          <Button
            label="Fix grammar & style"
            onPress={fixGrammar}
            variant="secondary"
            size="sm"
            disabled={!canSave}
            icon={<Ionicons name="sparkles-outline" size={14} color={palette.ink} />}
            style={styles.fixButton}
          />

          <View style={styles.detailBlock}>
            <Type role="label" pressed>
              Tags
            </Type>
            <TagInput value={tags} onChange={setTags} suggestions={knownTags.map((item) => item.tag)} />
          </View>

          <View style={styles.detailBlock}>
            <Type role="label" pressed>
              Folder
            </Type>
            <View style={styles.chipRow}>
              <Chip label="None" active={!categoryId} onPress={() => setCategoryId(undefined)} />
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  active={categoryId === category.id}
                  onPress={() => setCategoryId(category.id)}
                />
              ))}
              <Chip
                label={showNewFolder ? 'Cancel' : 'New folder'}
                active={false}
                onPress={() => setShowNewFolder((open) => !open)}
              />
            </View>

            {showNewFolder ? (
              <View style={styles.newFolderRow}>
                <Field
                  value={newFolder}
                  onChangeText={setNewFolder}
                  placeholder="Folder name"
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={createFolder}
                  containerStyle={styles.grow}
                  accessibilityLabel="New folder name"
                />
                <Button
                  label="Create"
                  size="md"
                  variant="primary"
                  disabled={newFolder.trim().length === 0}
                  onPress={createFolder}
                />
              </View>
            ) : null}
          </View>

          <Button
            label={existing ? 'Save changes' : 'Put it in the box'}
            onPress={handleSave}
            disabled={!canSave}
            variant="primary"
            size="lg"
            fullWidth
            haptic="medium"
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
    gap: spacing.xl,
  },
  titleField: {
    marginTop: spacing.sm,
  },
  bodyField: {
    marginTop: -spacing.md,
  },
  detailBlock: {
    gap: spacing.sm,
  },
  textArea: {
    minHeight: 240,
    fontSize: 19,
    lineHeight: 30,
    paddingHorizontal: 0,
  },
  fixButton: {
    alignSelf: 'flex-start',
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
