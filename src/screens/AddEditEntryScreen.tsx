import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { AiPanel } from '../components/AiPanel';
import { DatePicker } from '../components/DatePicker';
import { StatusPicker } from '../components/StatusPicker';
import { TagInput } from '../components/TagInput';
import { KIND_CONFIG, KIND_ORDER } from '../constants/kinds';
import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useAiRunner } from '../hooks/useAiRunner';
import { DictationDenial, useDictation } from '../hooks/useDictation';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import { AiTaskId } from '../services/ai';
import { SPEECH_MODEL_SIZE_LABEL } from '../services/speech';
import { EntryKind, EntryStatus } from '../types';
import { Button } from '../ui/Button';
import { Chip, Segmented } from '../ui/Controls';
import { Field } from '../ui/Field';
import { NavAction, NavBar } from '../ui/NavBar';
import { Backdrop, Panel, Rule } from '../ui/Surface';
import { Type } from '../ui/Type';
import { addTag, matchKnownTags, parseTags } from '../utils/tags';

type Props = NativeStackScreenProps<RootStackParamList, 'EntryEdit'>;

const MAX_TEXT_LENGTH = 4000;
const MAX_TITLE_LENGTH = 90;
const EDIT_TASKS: AiTaskId[] = ['polish', 'title', 'tags'];

export default function AddEditEntryScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { entries, categories, tags: knownTags, addEntry, updateEntry, addCategory } = useEntries();
  const { voiceProvider } = useSettings();
  const haptics = useHaptics();
  const toast = useToast();
  const ai = useAiRunner();

  const entryId = route.params?.entryId;
  const existing = useMemo(
    () => (entryId ? entries.find((entry) => entry.id === entryId) : undefined),
    [entryId, entries],
  );

  const [title, setTitle] = useState(existing?.title ?? '');
  const [text, setText] = useState(existing?.text ?? route.params?.initialText ?? '');
  const [status, setStatus] = useState<EntryStatus>(existing?.status ?? 'new');
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.categoryId);
  // Home's quick-add passes `initialKind` (e.g. tapping "Task") so the screen
  // opens with that kind pre-selected. The dirty check below needs the same
  // starting point, or picking a kind that way and immediately backing out
  // reads as an edit and triggers a false "Discard this?" prompt.
  const initialKind = existing?.kind ?? route.params?.initialKind ?? 'idea';
  const [kind, setKind] = useState<EntryKind>(initialKind);
  const [dueAt, setDueAt] = useState<number | undefined>(existing?.dueAt);
  const [newFolder, setNewFolder] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const kindConfig = KIND_CONFIG[kind];

  const saved = useRef(false);

  const dictation = useDictation({
    onText: setText,
    maxLength: MAX_TEXT_LENGTH,
    onDenied: useCallback(
      (reason: DictationDenial) => {
        haptics.warning();
        if (reason === 'no-model') {
          const usingVosk = voiceProvider === 'vosk';
          Alert.alert(
            usingVosk ? 'Speech pack needed' : 'No speech recognizer found',
            usingVosk
              ? `Voice input needs a one-time ${SPEECH_MODEL_SIZE_LABEL} speech pack. You can get it in Settings.`
              : "This phone doesn't have a speech recognition service installed. Switch to the offline speech pack in Settings.",
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => navigation.navigate('MainTabs', { screen: 'Settings' }) },
            ],
          );
          return;
        }
        const messages: Record<'unsupported' | 'no-permission' | 'failed', string> = {
          unsupported: 'Voice input is not available on this device.',
          'no-permission': 'Allow microphone access to dictate.',
          failed: 'The microphone could not start. Try again.',
        };
        toast.show({ message: messages[reason], tone: 'warning' });
      },
      [haptics, navigation, toast, voiceProvider],
    ),
  });

  const dirty =
    title.trim() !== (existing?.title ?? '') ||
    text.trim() !== (existing?.text ?? '') ||
    status !== (existing?.status ?? 'new') ||
    categoryId !== existing?.categoryId ||
    kind !== initialKind ||
    dueAt !== existing?.dueAt ||
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

    dictation.stop();
    Keyboard.dismiss();
    saved.current = true;

    const effectiveDueAt = kind === 'task' ? dueAt : undefined;
    const payload = {
      title: title.trim() || undefined,
      text: trimmed,
      tags,
      status,
      categoryId,
      kind,
      dueAt: effectiveDueAt,
    };

    if (existing) {
      updateEntry(existing.id, {
        ...payload,
        title: title.trim() || null,
        categoryId: categoryId ?? null,
        dueAt: effectiveDueAt ?? null,
      });
      toast.show({ message: 'Saved.', tone: 'success' });
    } else {
      addEntry(payload);
      toast.show({ message: kindConfig.savedLabel, tone: 'success' });
    }
    haptics.success();
    navigation.goBack();
  };

  const applyAi = (taskId: AiTaskId, output: string) => {
    if (taskId === 'polish') {
      // Hand back a real undo rather than pointing at the text field's own,
      // which is not dependable on Android and is the wrong thing to be
      // relying on for the one action here that overwrites what the user
      // actually wrote.
      const original = text;
      setText(output.slice(0, MAX_TEXT_LENGTH));
      toast.show({
        message: 'Replaced your text.',
        action: { label: 'Undo', onPress: () => setText(original) },
      });
    } else if (taskId === 'title') {
      setTitle(output.slice(0, MAX_TITLE_LENGTH));
    } else if (taskId === 'tags') {
      // The model's own picks, plus a deterministic pass over the library's
      // existing tags for anything it missed that is right there in the text.
      const suggested = [...parseTags(output), ...matchKnownTags(text, knownTags)];
      setTags((current) => suggested.reduce((acc, tag) => addTag(acc, tag), current));
    }
    haptics.success();
    ai.reset();
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
        title={existing ? `Edit ${kindConfig.label.toLowerCase()}` : `New ${kindConfig.label.toLowerCase()}`}
        onBack={() => navigation.goBack()}
        backLabel="Cancel"
        right={
          <NavAction
            icon="checkmark"
            label="Save"
            disabled={!canSave}
            onPress={handleSave}
          />
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
          <Segmented
            options={KIND_ORDER.map((option) => ({
              value: option,
              label: KIND_CONFIG[option].pickerLabel,
              icon: KIND_CONFIG[option].icon,
            }))}
            value={kind}
            onChange={setKind}
            accessibilityLabel="Kind"
          />

          <Panel style={styles.card} borderRadius={radii.lg}>
            <Field
              label="Title (optional)"
              value={title}
              onChangeText={setTitle}
              placeholder="Title"
              maxLength={MAX_TITLE_LENGTH}
              returnKeyType="next"
            />

            <Field
              label={kindConfig.fieldLabel}
              value={text}
              onChangeText={setText}
              placeholder={kindConfig.placeholder}
              multiline
              maxLength={MAX_TEXT_LENGTH}
              showCounter
              hint={dictation.listening ? 'Listening, speak now' : undefined}
              inputStyle={styles.textArea}
            />

            {dictation.supported ? (
              <View style={styles.dictationRow}>
                <Button
                  label={dictation.starting ? 'Starting…' : dictation.listening ? 'Stop listening' : 'Dictate'}
                  onPress={() => void dictation.toggle(text)}
                  variant={dictation.listening ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={ai.running || dictation.starting}
                  loading={dictation.starting}
                  icon={
                    <Ionicons
                      name={dictation.listening ? 'stop-circle' : 'mic-outline'}
                      size={15}
                      color={dictation.listening ? palette.accentInk : palette.ink}
                    />
                  }
                />
                {dictation.listening ? (
                  <View
                    style={[
                      styles.listening,
                      { borderRadius: radii.pill, backgroundColor: withAlpha(palette.accent, 0.16) },
                    ]}
                  >
                    <Ionicons name="radio-button-on" size={11} color={palette.accent} />
                    <Type role="caption" color={palette.accent} numberOfLines={1} style={styles.listeningText}>
                      {dictation.partial || 'Listening…'}
                    </Type>
                  </View>
                ) : null}
              </View>
            ) : null}
          </Panel>

          {kind === 'task' ? (
            <Panel style={styles.card} borderRadius={radii.lg}>
              <Type role="label" pressed>
                Due date
              </Type>
              <DatePicker value={dueAt} onChange={setDueAt} />
            </Panel>
          ) : null}

          <View style={styles.section}>
            <Type role="label" pressed style={styles.sectionLabel}>
              Assistant
            </Type>
            <AiPanel
              runner={ai}
              tasks={EDIT_TASKS}
              disabled={!canSave || dictation.listening}
              onRun={(taskId) =>
                void ai.run(
                  taskId,
                  text,
                  knownTags.map((item) => item.tag),
                )
              }
              onApply={applyAi}
              applyLabel={(taskId) =>
                taskId === 'polish' ? 'Replace my text' : taskId === 'title' ? 'Use this title' : 'Add these tags'
              }
              onOpenSettings={() => navigation.navigate('Models')}
            />
          </View>

          <Panel style={styles.card} borderRadius={radii.lg}>
            <View style={styles.detailBlock}>
              <Type role="label" pressed>
                Tags
              </Type>
              <TagInput value={tags} onChange={setTags} suggestions={knownTags.map((item) => item.tag)} />
            </View>

            <Rule />

            <View style={styles.detailBlock}>
              <Type role="label" pressed>
                Status
              </Type>
              <StatusPicker value={status} onChange={setStatus} />
            </View>

            <Rule />

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
          </Panel>

          <Button
            label={existing ? 'Save changes' : kindConfig.saveLabel}
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
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailBlock: {
    gap: spacing.sm,
  },
  textArea: {
    minHeight: 160,
  },
  dictationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listening: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  listeningText: {
    flex: 1,
    fontSize: 12,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    paddingHorizontal: spacing.xs,
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
