import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { AppMark } from '../components/AppMark';
import { ACCENT_COLORS, PAGE_PAD, contrastingInk, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { MainTabScreenProps } from '../navigation';
import { appIconModuleAvailable } from '../services/appIcon';
import { clearAllStoredData } from '../storage/storage';
import { AccentId, ThemeMode } from '../types';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Controls';
import { CreateFolderDialog } from '../ui/CreateFolderDialog';
import { Field } from '../ui/Field';
import { Group, Row, SectionHeader } from '../ui/Group';
import { NavBar } from '../ui/NavBar';
import { Backdrop } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = MainTabScreenProps<'Settings'>;

const THEME_OPTIONS = [
  { value: 'system' as ThemeMode, label: 'Auto', icon: 'phone-portrait-outline' as const },
  { value: 'light' as ThemeMode, label: 'Day', icon: 'sunny-outline' as const },
  { value: 'dark' as ThemeMode, label: 'Night', icon: 'moon-outline' as const },
];

function deleteFolderMessage(count: number): string {
  if (count === 0) return 'This folder is empty.';
  return `The ${count} ${count === 1 ? 'entry' : 'entries'} inside will be kept, just not in a folder any more.`;
}

export default function SettingsScreen({ navigation }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  const { palette, mode, setMode, isDark, accentId, setAccentId, appIconMode, resetPreferences } = useTheme();
  const settings = useSettings();
  const { entries, categories, addCategory, renameCategory, deleteCategory, clearAll } = useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [erasing, setErasing] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  /**
   * The home-screen icon only actually updates on the next cold start (see
   * ThemeContext) — applying it immediately can make Android kill the app
   * mid-session, which reads as a crash. Tell the user instead of surprising
   * them with it.
   */
  const noteIconWillUpdateOnRestart = () => {
    if (appIconMode === 'auto' && appIconModuleAvailable) {
      toast.show({ message: 'Restart Trovelo to update the home screen icon to match.' });
    }
  };

  const handleModeChange = (nextMode: ThemeMode) => {
    setMode(nextMode);
    noteIconWillUpdateOnRestart();
  };

  const handleAccentChange = (nextAccentId: AccentId) => {
    haptics.light();
    setAccentId(nextAccentId);
    noteIconWillUpdateOnRestart();
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
      deleteFolderMessage(count),
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
    if (erasing) return;
    Alert.alert(
      'Delete everything?',
      `All ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}, folders, settings and cached exports will be permanently removed from this phone. This cannot be undone. Make a backup first if you might want your entries back.`,
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
            setErasing(true);
            try {
              await clearAllStoredData();
              await Promise.all([settings.resetSettings(), resetPreferences()]);
              clearAll();
              haptics.warning();
              toast.show({ message: 'Everything has been deleted.', tone: 'warning' });
              navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
            } catch (error) {
              haptics.warning();
              toast.show({
                message: error instanceof Error ? error.message : 'Some data could not be deleted. Please try again.',
                tone: 'warning',
              });
            } finally {
              setErasing(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Backdrop>
      <NavBar title="Settings" align="start" large borderless={false} elevated />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + spacing.lg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <SectionHeader title="Appearance" />
          <Segmented
            options={THEME_OPTIONS}
            value={mode}
            onChange={handleModeChange}
            accessibilityLabel="Appearance"
          />
          <View style={styles.accentRow} accessibilityRole="radiogroup" accessibilityLabel="Accent colour">
            {ACCENT_COLORS.map((option) => {
              const swatch = isDark ? option.dark : option.light;
              const selected = option.id === accentId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => handleAccentChange(option.id)}
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
                  {selected ? <Ionicons name="checkmark" size={14} color={contrastingInk(swatch)} /> : null}
                </Pressable>
              );
            })}
          </View>
          <Type role="caption" color={palette.inkFaint} align="center" style={styles.accentName}>
            Accent · {ACCENT_COLORS.find((option) => option.id === accentId)?.label}
          </Type>
        </View>

        <View>
          <SectionHeader title="General" />
          <Group>
            <Row title="Privacy" subtitle="Nothing leaves this phone" chevron={false} />
            <Row title="App icon" onPress={() => navigation.navigate('AppIcon')} />
            <Row
              title="Vibration"
              subtitle="Haptic feedback"
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
            <Row
              title="Backup & restore"
              subtitle="Encrypted local backups"
              onPress={() => navigation.navigate('Backup')}
            />
          </Group>
        </View>

        <View>
          <SectionHeader title="Folders" hint="Deleting a folder keeps what's inside it." />
          <Group>
            {categories.length === 0 ? <Row title="No folders yet" chevron={false} /> : null}
            {categories.length > 0 &&
              categories.map((category) => {
                const count = entries.filter((entry) => entry.categoryId === category.id).length;
                const subtitle = `${count} ${count === 1 ? 'entry' : 'entries'}`;
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
                    right={
                      <View style={styles.folderActions}>
                        <Button
                          label="Rename"
                          size="sm"
                          variant="plain"
                          onPress={() => {
                            setEditingId(category.id);
                            setEditingName(category.name);
                          }}
                          accessibilityLabel={`Rename folder ${category.name}`}
                        />
                        <Button
                          label="Delete"
                          size="sm"
                          variant="secondary"
                          onPress={() => confirmDeleteFolder(category.id)}
                          accessibilityLabel={`Delete folder ${category.name}`}
                        />
                      </View>
                    }
                    chevron={false}
                  />
                );
              })}
            <Row title="+ Create folder" chevron={false} onPress={() => setCreateFolderOpen(true)} />
          </Group>
        </View>

        <View>
          <SectionHeader title="Workflow" />
          <Group>
            <Row title="Stats" subtitle="Streaks, counts and rediscoveries." onPress={() => navigation.navigate('Stats')} />
            <Row
              title="Weekly review"
              subtitle="A few ideas you haven't seen in a while."
              onPress={() => navigation.navigate('Review')}
            />
            <Row title="Tidy up" subtitle="Tag entries that don't have any yet." onPress={() => navigation.navigate('Tidy')} />
          </Group>
        </View>

        <View>
          <SectionHeader title="Danger zone" />
          <Group borderColor={withAlpha(palette.danger, 0.35)}>
            <Row
              title="Delete everything"
              subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} on this phone`}
              destructive
              onPress={confirmEraseEverything}
              disabled={erasing}
              chevron={false}
            />
          </Group>
        </View>

        <View style={styles.about}>
          <AppMark size={48} />
          <Type role="caption" style={styles.aboutText}>
            No account, no server, no network requests. Everything you write stays on this phone.
          </Type>
        </View>
      </ScrollView>

      <CreateFolderDialog
        visible={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        onCreate={addCategory}
      />
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: PAGE_PAD,
    paddingTop: spacing.sm,
    gap: spacing.xxl,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  accentName: {
    marginTop: spacing.sm,
  },
  folderEdit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  folderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  grow: {
    flex: 1,
  },
  about: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  aboutText: {
    lineHeight: 22,
    textAlign: 'center',
  },
});
