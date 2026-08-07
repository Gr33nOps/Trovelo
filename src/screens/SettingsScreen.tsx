import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { RemoteAiSettings } from '../components/RemoteAiSettings';
import { ACCENT_COLORS, contrastingInk, radius as radii, spacing } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { androidSpeechModuleAvailable, isAndroidSpeechAvailable } from '../services/androidSpeech';
import { clearRemoteApiKey, getRemoteApiKey, setRemoteApiKey } from '../services/aiProvider';
import {
  SPEECH_MODEL_SIZE_LABEL,
  downloadSpeechModel,
  isSpeechModelReady,
  removeSpeechModel,
  speechAvailable,
} from '../services/speech';
import { clearAllStoredData } from '../storage/storage';
import { AiEngineKind, RemoteAiConfig, ThemeMode, VoiceProvider } from '../types';
import { Button } from '../ui/Button';
import { ProgressBar, Segmented } from '../ui/Controls';
import { Field } from '../ui/Field';
import { Group, Row, SectionHeader } from '../ui/Group';
import { IconTile } from '../ui/IconTile';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = MainTabScreenProps<'Settings'>;

const THEME_OPTIONS = [
  { value: 'system' as ThemeMode, label: 'Automatic', icon: 'phone-portrait-outline' as const },
  { value: 'light' as ThemeMode, label: 'Day', icon: 'sunny-outline' as const },
  { value: 'dark' as ThemeMode, label: 'Night', icon: 'moon-outline' as const },
];

const VOICE_OPTIONS = [
  { value: 'vosk' as VoiceProvider, label: 'Offline pack', icon: 'cloud-offline-outline' as const },
  { value: 'android' as VoiceProvider, label: "Phone's recognizer", icon: 'wifi-outline' as const },
];

const ENGINE_OPTIONS = [
  { value: 'local' as AiEngineKind, label: 'On this phone', icon: 'phone-portrait-outline' as const },
  { value: 'remote' as AiEngineKind, label: 'Cloud', icon: 'cloud-outline' as const },
];

export default function SettingsScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { palette, mode, setMode, isDark, accentId, setAccentId } = useTheme();
  const settings = useSettings();
  const { entries, categories, addCategory, renameCategory, deleteCategory, clearAll } = useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const [newFolder, setNewFolder] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [speechReady, setSpeechReady] = useState(false);
  const [speechProgress, setSpeechProgress] = useState<number | null>(null);
  const [androidSpeechReady, setAndroidSpeechReady] = useState<boolean | null>(null);
  const [hasRemoteKey, setHasRemoteKey] = useState(false);

  const untaggedCount = entries.filter((entry) => entry.tags.length === 0 && !entry.archivedAt).length;

  const refreshRemoteKey = useCallback(() => {
    void getRemoteApiKey().then((key) => setHasRemoteKey(!!key));
  }, []);

  useFocusEffect(refreshRemoteKey);

  const handleEngineChange = (value: AiEngineKind) => {
    if (value === 'local') {
      settings.set('aiEngine', 'local');
      return;
    }
    Alert.alert(
      'Use a cloud assistant?',
      "Notes you run through the assistant will be sent to whichever provider you set up below, along with your API key. Nothing else on this phone is affected, and switching back is instant.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => settings.set('aiEngine', 'remote') },
      ],
    );
  };

  const handleSaveRemote = (config: RemoteAiConfig, key: string) => {
    settings.set('remoteAiConfig', config);
    if (key) {
      void setRemoteApiKey(key).then(() => {
        setHasRemoteKey(true);
        haptics.success();
        toast.show({ message: 'Cloud provider saved.', tone: 'success' });
      });
    } else {
      haptics.success();
      toast.show({ message: 'Cloud provider saved.', tone: 'success' });
    }
  };

  const handleClearRemoteKey = () => {
    void clearRemoteApiKey().then(() => {
      setHasRemoteKey(false);
      haptics.warning();
      toast.show({ message: 'API key removed.' });
    });
  };

  const refreshSpeech = useCallback(() => {
    void isSpeechModelReady().then(setSpeechReady);
  }, []);

  useFocusEffect(refreshSpeech);

  const refreshAndroidSpeech = useCallback(() => {
    void isAndroidSpeechAvailable().then(setAndroidSpeechReady);
  }, []);

  useFocusEffect(refreshAndroidSpeech);

  const handleDownloadSpeech = () => {
    setSpeechProgress(0);
    downloadSpeechModel(
      setSpeechProgress,
      () => {
        haptics.success();
        setSpeechProgress(null);
        refreshSpeech();
        toast.show({ message: 'Speech pack installed. You can dictate now.', tone: 'success' });
      },
      (message) => {
        haptics.warning();
        setSpeechProgress(null);
        toast.show({ message, tone: 'warning' });
      },
    );
  };

  const confirmRemoveSpeech = () => {
    Alert.alert('Remove the speech pack?', 'Dictation will stop working until you download it again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeSpeechModel();
          haptics.warning();
          refreshSpeech();
        },
      },
    ]);
  };

  const handleAddFolder = () => {
    try {
      addCategory(newFolder);
      setNewFolder('');
      haptics.light();
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'That folder could not be created.',
        tone: 'warning',
      });
    }
  };

  const handleRename = () => {
    if (!editingId) return;
    try {
      renameCategory(editingId, editingName);
      haptics.light();
      setEditingId(null);
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'That folder could not be renamed.',
        tone: 'warning',
      });
    }
  };

  const confirmDeleteFolder = (id: string) => {
    const folder = categories.find((category) => category.id === id);
    if (!folder) return;
    const count = entries.filter((entry) => entry.categoryId === id).length;
    Alert.alert(
      `Delete "${folder.name}"?`,
      count > 0
        ? `The ${count} ${count === 1 ? 'entry' : 'entries'} inside will be kept, just not in a folder any more.`
        : 'This folder is empty.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete folder',
          style: 'destructive',
          onPress: () => {
            haptics.warning();
            deleteCategory(id);
          },
        },
      ],
    );
  };

  const confirmEraseEverything = () => {
    Alert.alert(
      'Delete everything?',
      `All ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}, folders and settings will be permanently removed from this phone. This cannot be undone. Make a backup first if you might want them back.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Back up first',
          onPress: () => navigation.navigate('Backup'),
        },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            haptics.warning();
            clearAll();
            await clearAllStoredData();
            toast.show({ message: 'Everything has been deleted.', tone: 'warning' });
          },
        },
      ],
    );
  };

  return (
    <Backdrop>
      <NavBar title="Settings" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <SectionHeader title="Appearance" hint="One accent colour, used for every icon and highlight in the app." />
          <Segmented
            options={THEME_OPTIONS}
            value={mode}
            onChange={setMode}
            accessibilityLabel="Appearance"
          />
          <View style={styles.accentRow} accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
            {ACCENT_COLORS.map((option) => {
              const swatch = isDark ? option.dark : option.light;
              const selected = option.id === accentId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    haptics.light();
                    setAccentId(option.id);
                  }}
                  hitSlop={6}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.swatch,
                    {
                      backgroundColor: swatch,
                      borderColor: selected ? palette.ink : 'transparent',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  {selected ? <Ionicons name="checkmark" size={16} color={contrastingInk(swatch)} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <SectionHeader title="Feel" />
          <Group>
            <Row
              title="Vibration"
              subtitle="A small tap when you press things."
              left={<IconTile icon="pulse-outline" size={32} iconSize={16} />}
              right={
                <Switch
                  value={settings.hapticsEnabled}
                  onValueChange={(value) => settings.set('hapticsEnabled', value)}
                  trackColor={{ false: palette.switchOff, true: palette.accent }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Vibration"
                />
              }
            />
          </Group>
        </View>

        <View>
          <SectionHeader
            title="Assistant"
            hint={
              settings.aiEngine === 'remote'
                ? 'Set to a cloud provider below. Notes run through it leave this phone.'
                : 'Runs on this phone. Nothing you write is ever uploaded.'
            }
          />
          <Group>
            <Row
              title="Use the assistant"
              subtitle="Polish wording, suggest titles and tags."
              left={<IconTile icon="hardware-chip-outline" size={32} iconSize={16} />}
              right={
                <Switch
                  value={settings.aiEnabled}
                  onValueChange={(value) => {
                    haptics.light();
                    settings.setAiEnabled(value);
                  }}
                  trackColor={{ false: palette.switchOff, true: palette.accent }}
                  thumbColor="#FFFFFF"
                  accessibilityLabel="Use the assistant"
                />
              }
            />
          </Group>

          <View style={styles.engineSegmented}>
            <Segmented
              options={ENGINE_OPTIONS}
              value={settings.aiEngine}
              onChange={handleEngineChange}
              accessibilityLabel="Assistant engine"
            />
          </View>

          {settings.aiEngine === 'local' ? (
            <Group>
              <Row
                title="Model"
                subtitle={
                  settings.selectedModelPath
                    ? decodeURIComponent(settings.selectedModelPath.split('/').pop() ?? '')
                    : 'None chosen yet'
                }
                left={<IconTile icon="cube-outline" size={32} iconSize={16} />}
                onPress={() => navigation.navigate('Models')}
                accessibilityHint="Choose, download or remove an assistant model"
              />
            </Group>
          ) : (
            <Panel borderRadius={radii.lg}>
              <RemoteAiSettings
                config={settings.remoteAiConfig}
                hasStoredKey={hasRemoteKey}
                onSave={handleSaveRemote}
                onClearKey={handleClearRemoteKey}
              />
            </Panel>
          )}
        </View>

        {speechAvailable || androidSpeechModuleAvailable ? (
          <View>
            <SectionHeader
              title="Voice input"
              hint="Dictate instead of typing. The offline pack never leaves this phone; the phone's own recognizer is more accurate but is not offline."
            />
            <Segmented
              options={VOICE_OPTIONS}
              value={settings.voiceProvider}
              onChange={(value) => settings.set('voiceProvider', value)}
              accessibilityLabel="Voice input engine"
              style={styles.voiceSegmented}
            />
            {settings.voiceProvider === 'vosk' ? (
              <>
                <Group>
                  {speechProgress !== null ? (
                    <Row
                      title="Downloading speech pack"
                      left={<IconTile icon="cloud-download-outline" size={32} iconSize={16} />}
                      right={null}
                      subtitle={`${Math.round(speechProgress * 100)}% done`}
                      chevron={false}
                    />
                  ) : (
                    <Row
                      title={speechReady ? 'Speech pack installed' : 'Download speech pack'}
                      subtitle={
                        speechReady
                          ? 'Dictation is ready to use. Fully offline.'
                          : `About ${SPEECH_MODEL_SIZE_LABEL}, downloaded once. Fully offline.`
                      }
                      left={
                        <IconTile
                          icon={speechReady ? 'checkmark-circle' : 'mic-outline'}
                          size={32}
                          iconSize={16}
                          tint={speechReady ? undefined : palette.inkSoft}
                        />
                      }
                      right={
                        speechReady ? (
                          <Button label="Remove" size="sm" variant="secondary" onPress={confirmRemoveSpeech} />
                        ) : (
                          <Button label="Download" size="sm" variant="primary" onPress={handleDownloadSpeech} />
                        )
                      }
                    />
                  )}
                </Group>
                {speechProgress !== null ? (
                  <View style={styles.progress}>
                    <ProgressBar fraction={speechProgress} />
                  </View>
                ) : null}
              </>
            ) : (
              <Group>
                <Row
                  title={androidSpeechReady ? "Phone's recognizer ready" : 'No recognizer found'}
                  subtitle={
                    androidSpeechReady
                      ? 'Uses whatever speech service is installed, usually the Google app. Audio leaves this phone to be transcribed.'
                      : "This phone doesn't have a speech recognition service installed. Switch back to the offline pack."
                  }
                  left={
                    <IconTile
                      icon={androidSpeechReady ? 'checkmark-circle' : 'alert-circle-outline'}
                      size={32}
                      iconSize={16}
                      tint={androidSpeechReady ? undefined : palette.danger}
                    />
                  }
                  chevron={false}
                />
              </Group>
            )}
          </View>
        ) : null}

        <View>
          <SectionHeader
            title="Folders"
            hint="Optional grouping. Deleting a folder never deletes the entries inside it."
          />
          <Group>
            {categories.length === 0 ? (
              <Row
                title="No folders yet"
                subtitle="Most people never need one. Search and tags usually do the job."
                chevron={false}
              />
            ) : (
              categories.map((category) => {
                const count = entries.filter((entry) => entry.categoryId === category.id).length;
                const openTasks = entries.filter(
                  (entry) => entry.categoryId === category.id && entry.kind === 'task' && entry.status !== 'done',
                ).length;
                const subtitle = `${count} ${count === 1 ? 'entry' : 'entries'}${
                  openTasks > 0 ? `, ${openTasks} open ${openTasks === 1 ? 'task' : 'tasks'}` : ''
                }`;
                const editing = editingId === category.id;
                return editing ? (
                  <View key={category.id} style={styles.folderEdit}>
                    <Field
                      value={editingName}
                      onChangeText={setEditingName}
                      maxLength={40}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={handleRename}
                      containerStyle={styles.grow}
                      accessibilityLabel={`Rename ${category.name}`}
                    />
                    <Button label="Save" size="sm" variant="primary" onPress={handleRename} />
                    <Button label="Cancel" size="sm" variant="plain" onPress={() => setEditingId(null)} />
                  </View>
                ) : (
                  <Row
                    key={category.id}
                    title={category.name}
                    subtitle={subtitle}
                    left={<IconTile icon="folder-outline" size={32} iconSize={16} />}
                    onPress={() => {
                      setEditingId(category.id);
                      setEditingName(category.name);
                    }}
                    accessibilityHint="Rename this folder"
                    right={
                      <Button
                        label="Delete"
                        size="sm"
                        variant="secondary"
                        onPress={() => confirmDeleteFolder(category.id)}
                        accessibilityLabel={`Delete folder ${category.name}`}
                      />
                    }
                  />
                );
              })
            )}
          </Group>

          <View style={styles.addFolder}>
            <Field
              value={newFolder}
              onChangeText={setNewFolder}
              placeholder="New folder name"
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleAddFolder}
              containerStyle={styles.grow}
              accessibilityLabel="New folder name"
            />
            <Button
              label="Add"
              size="md"
              variant="primary"
              disabled={newFolder.trim().length === 0}
              onPress={handleAddFolder}
            />
          </View>
        </View>

        <View>
          <SectionHeader title="Working through your box" />
          <Group>
            <Row
              title="Weekly review"
              subtitle="Work through a few things you have not seen in a while."
              left={<IconTile icon="checkmark-done-outline" size={32} iconSize={16} />}
              onPress={() => navigation.navigate('Review')}
            />
            <Row
              title="Tidy up"
              subtitle={
                untaggedCount > 0
                  ? `Suggest tags for ${untaggedCount} untagged ${untaggedCount === 1 ? 'entry' : 'entries'}.`
                  : 'Everything already has at least one tag.'
              }
              left={<IconTile icon="sparkles-outline" size={32} iconSize={16} />}
              onPress={() => navigation.navigate('Tidy')}
            />
          </Group>
        </View>

        <View>
          <SectionHeader title="Your data" />
          <Group>
            <Row
              title="Backup and restore"
              subtitle="Save a copy, or move your entries to another phone."
              left={<IconTile icon="save-outline" size={32} iconSize={16} />}
              onPress={() => navigation.navigate('Backup')}
            />
            <Row
              title="Delete everything"
              subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} on this phone`}
              left={<IconTile icon="trash-outline" size={32} iconSize={16} tint={palette.danger} />}
              destructive
              onPress={confirmEraseEverything}
              chevron={false}
            />
          </Group>
        </View>

        <Panel style={styles.about} borderRadius={radii.lg}>
          <Ionicons name="lock-closed-outline" size={18} color={palette.inkFaint} />
          <Type role="caption" style={styles.aboutText}>
            Trovelo has no account and no server. Your entries, the assistant and voice input all
            stay on this phone by default. Nothing leaves unless you turn on a cloud assistant or the
            phone's own speech recognizer above, both optional, or share a backup file yourself.
          </Type>
        </Panel>
      </ScrollView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  accentRow: {
    flexDirection: 'row',
    // No wrap: six fixed-size swatches spread evenly across one row fit
    // every real device width. Wrapping made the last row's count vary by
    // screen width, so the swatches never lined up the same way twice.
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  progress: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  voiceSegmented: {
    marginBottom: spacing.md,
  },
  engineSegmented: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  folderEdit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  addFolder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  grow: {
    flex: 1,
  },
  about: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  aboutText: {
    flex: 1,
    lineHeight: 20,
  },
});
