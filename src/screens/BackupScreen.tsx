import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useEntries } from '../context/EntriesContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptics } from '../hooks/useHaptics';
import { RootStackParamList } from '../navigation';
import {
  BackupContents,
  LockedBackupError,
  WrongPasswordError,
  cleanBackupCache,
  createBackupFile,
  createMarkdownExport,
  openBackupFile,
} from '../services/backup';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/Controls';
import { Field } from '../ui/Field';
import { SectionHeader } from '../ui/Group';
import { NavBar } from '../ui/NavBar';
import { Backdrop, Panel } from '../ui/Surface';
import { Type } from '../ui/Type';

type Props = NativeStackScreenProps<RootStackParamList, 'Backup'>;

export default function BackupScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { entries, categories, restoreBackup } = useEntries();
  const haptics = useHaptics();
  const toast = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const [picking, setPicking] = useState(false);
  const [lockedUri, setLockedUri] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const missingConfirmation = password.length > 0 && confirm.length === 0;
  const tooShort = password.length > 0 && password.length < 8;
  const busy = creating || exporting || picking || unlocking;

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!busy) return;
        event.preventDefault();
        toast.show({ message: 'Wait for the current file operation to finish.', tone: 'warning' });
      }),
    [navigation, busy, toast],
  );

  const share = async (uri: string, fileName: string, mimeType: string) => {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('This device cannot open the share sheet.');
    }
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: fileName });
  };

  const handleCreateBackup = async () => {
    if (busy) return;
    if (missingConfirmation) {
      toast.show({ message: 'Type the password again before creating the backup.', tone: 'warning' });
      return;
    }
    if (mismatch) {
      toast.show({ message: 'The two passwords are not the same.', tone: 'warning' });
      return;
    }
    if (tooShort) {
      toast.show({ message: 'Use at least 8 characters, or leave the password empty.', tone: 'warning' });
      return;
    }

    setCreating(true);
    if (password) setProgress(0);
    try {
      // Deliberately data-only: appearance and the streak belong to the phone
      // you are on, not to the entries. The format still reads preferences out
      // of older files if one turns up.
      const { uri, fileName } = await createBackupFile(entries, categories, undefined, {
        password: password || undefined,
        onProgress: password ? setProgress : undefined,
      });
      setProgress(null);
      await share(uri, fileName, 'application/json');
      haptics.success();
      setPassword('');
      setConfirm('');
      toast.show({
        message: password
          ? 'Backup created and locked. Keep the password somewhere safe.'
          : 'Backup created.',
        tone: 'success',
      });
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'The backup could not be created.',
        tone: 'warning',
      });
    } finally {
      setProgress(null);
      setCreating(false);
      // Never leave a plain copy of everything sitting in the cache.
      void cleanBackupCache().catch(() => {});
    }
  };

  const handleExportMarkdown = async () => {
    if (busy) return;
    setExporting(true);
    try {
      const { uri, fileName } = await createMarkdownExport(entries, categories);
      await share(uri, fileName, 'text/markdown');
      haptics.success();
    } catch (error) {
      haptics.warning();
      toast.show({
        message: error instanceof Error ? error.message : 'The export could not be created.',
        tone: 'warning',
      });
    } finally {
      setExporting(false);
      void cleanBackupCache().catch(() => {});
    }
  };

  const confirmRestore = (contents: BackupContents) => {
    const count = contents.entries.length;
    if (count === 0) {
      toast.show({ message: 'That backup has nothing in it.', tone: 'warning' });
      return;
    }
    Alert.alert(
      'Restore this backup?',
      `It holds ${count} ${count === 1 ? 'entry' : 'entries'}. They will be added to this phone. Nothing already here is removed or changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add them',
          onPress: () => {
            const added = restoreBackup(contents.entries, contents.categories);
            haptics.success();
            toast.show({
              message:
                added > 0
                  ? `${added} new ${added === 1 ? 'entry' : 'entries'} added.`
                  : 'Everything in that backup was already here.',
              tone: 'success',
            });
          },
        },
      ],
    );
  };

  const handleChooseFile = async () => {
    if (busy) return;
    let selectedUri: string | null = null;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      selectedUri = asset.uri;
      setLockedUri(null);
      setUnlockPassword('');
      confirmRestore(await openBackupFile(asset.uri));
    } catch (error) {
      if (error instanceof LockedBackupError && selectedUri) {
        setLockedUri(selectedUri);
        setUnlockPassword('');
        haptics.light();
      } else {
        haptics.warning();
        toast.show({
          message: error instanceof Error ? error.message : 'That file could not be opened.',
          tone: 'warning',
        });
      }
    } finally {
      setPicking(false);
    }
  };

  const handleUnlock = async () => {
    if (!lockedUri || !unlockPassword || busy) return;
    setUnlocking(true);
    setProgress(0);
    try {
      const contents = await openBackupFile(lockedUri, {
        password: unlockPassword,
        onProgress: setProgress,
      });
      setLockedUri(null);
      setUnlockPassword('');
      confirmRestore(contents);
    } catch (error) {
      haptics.warning();
      toast.show({
        message:
          error instanceof WrongPasswordError
            ? 'Wrong password. Check it and try again.'
            : error instanceof Error
              ? error.message
              : 'That backup could not be opened.',
        tone: 'warning',
      });
    } finally {
      setProgress(null);
      setUnlocking(false);
      void cleanBackupCache().catch(() => {});
    }
  };

  return (
    <Backdrop>
      <NavBar title="Backup" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Panel style={styles.intro} borderRadius={radii.lg}>
          <Ionicons name="shield-checkmark-outline" size={18} color={palette.inkFaint} />
          <Type role="caption" style={styles.introText}>
            A backup is a single file holding everything in your box. It stays on this phone until you choose
            to share it. Add a password and the file is encrypted, so only someone who knows it can read it.
          </Type>
        </Panel>

        <View>
          <SectionHeader
            title="Make a backup"
            hint={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} will be included.`}
          />
          <Panel style={styles.card} borderRadius={radii.lg}>
            <Field
              label="Password (optional)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              error={tooShort ? 'Use at least 8 characters.' : undefined}
            />
            {password ? (
              <Field
                label="Type it again"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                error={mismatch ? 'The two passwords are not the same.' : undefined}
              />
            ) : null}

            {password ? (
              <View
                style={[
                  styles.warning,
                  { borderRadius: radii.md, backgroundColor: withAlpha(palette.accent, 0.14) },
                ]}
              >
                <Ionicons name="key-outline" size={15} color={palette.accent} />
                <Type role="caption" color={palette.ink} style={styles.warningText}>
                  Write the password down. There is no way to recover it, and without it the backup cannot be
                  opened.
                </Type>
              </View>
            ) : null}

            {progress !== null && creating ? (
              <ProgressBar fraction={progress} label={`Encrypting… ${Math.round(progress * 100)}%`} />
            ) : null}

            <Button
              label={password ? 'Create locked backup' : 'Create backup'}
              onPress={() => void handleCreateBackup()}
              loading={creating}
              disabled={busy || missingConfirmation || mismatch || tooShort || entries.length === 0}
              variant="primary"
              size="md"
              fullWidth
              haptic="medium"
            />
            <Button
              label="Export as Markdown instead"
              onPress={() => void handleExportMarkdown()}
              loading={exporting}
              disabled={busy || entries.length === 0}
              variant="plain"
              size="sm"
              fullWidth
            />
          </Panel>
        </View>

        <View>
          <SectionHeader title="Restore from a backup" hint="Entries are added, never replaced." />
          <Panel style={styles.card} borderRadius={radii.lg}>
            <Button
              label="Choose a backup file"
              onPress={() => void handleChooseFile()}
              loading={picking}
              disabled={busy}
              variant="secondary"
              size="md"
              fullWidth
              icon={<Ionicons name="folder-open-outline" size={16} color={palette.ink} />}
            />

            {lockedUri ? (
              <View style={[styles.locked, { borderTopColor: palette.edge }]}>
                <View style={styles.lockedHeader}>
                  <Ionicons name="lock-closed" size={16} color={palette.accent} />
                  <Type role="bodyStrong" pressed>
                    This backup is locked
                  </Type>
                </View>
                <Field
                  value={unlockPassword}
                  onChangeText={setUnlockPassword}
                  placeholder="Password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  onSubmitEditing={() => void handleUnlock()}
                  accessibilityLabel="Backup password"
                />
                {progress !== null && unlocking ? (
                  <ProgressBar fraction={progress} label={`Unlocking… ${Math.round(progress * 100)}%`} />
                ) : null}
                <View style={styles.lockedActions}>
                  <Button
                    label="Unlock"
                    onPress={() => void handleUnlock()}
                    loading={unlocking}
                    disabled={!unlockPassword || busy}
                    variant="primary"
                    size="md"
                    style={styles.grow}
                  />
                  <Button
                    label="Cancel"
                    onPress={() => {
                      setLockedUri(null);
                      setUnlockPassword('');
                    }}
                    variant="plain"
                    size="md"
                    disabled={unlocking}
                  />
                </View>
              </View>
            ) : null}
          </Panel>
        </View>
      </ScrollView>
    </Backdrop>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  intro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  introText: {
    flex: 1,
    lineHeight: 20,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
  },
  warningText: {
    flex: 1,
    lineHeight: 19,
  },
  locked: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lockedActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
