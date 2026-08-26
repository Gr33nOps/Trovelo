import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Button } from './Button';
import { Field } from './Field';
import { Panel } from './Surface';
import { Type } from './Type';

const MAX_FOLDER_NAME_LENGTH = 40;

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** May throw (e.g. a duplicate name) — the dialog stays open and shows the message inline. */
  readonly onCreate: (name: string) => void;
}

/** A small centered prompt, not a bottom sheet — for the single "name this" input a folder needs. */
export function CreateFolderDialog({ visible, onClose, onCreate }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();

  const handleClose = () => {
    setName('');
    setError(undefined);
    onClose();
  };

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      onCreate(trimmed);
      haptics.light();
      handleClose();
    } catch (err) {
      haptics.warning();
      setError(err instanceof Error ? err.message : 'That folder could not be created.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <Pressable
        style={[
          styles.backdrop,
          { backgroundColor: withAlpha('#000000', 0.48), paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        onPress={handleClose}
        accessible={false}
      >
        <Pressable
          accessibilityViewIsModal
          accessible={false}
          onPress={(event) => event.stopPropagation()}
          style={styles.dialogWrap}
        >
          <Panel style={styles.dialog} borderRadius={radii.lg} borderColor={palette.edgeStrong}>
            <Type role="title" pressed>
              New folder
            </Type>
            <Field
              value={name}
              onChangeText={(value) => {
                setName(value);
                if (error) setError(undefined);
              }}
              placeholder="Folder name"
              maxLength={MAX_FOLDER_NAME_LENGTH}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              error={error}
              accessibilityLabel="Folder name"
            />
            <View style={styles.actions}>
              <Button label="Cancel" variant="plain" size="md" style={styles.grow} onPress={handleClose} />
              <Button
                label="Create"
                variant="primary"
                size="md"
                style={styles.grow}
                disabled={name.trim().length === 0}
                onPress={handleCreate}
              />
            </View>
          </Panel>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  dialogWrap: {
    width: '100%',
    maxWidth: 360,
  },
  dialog: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
});
