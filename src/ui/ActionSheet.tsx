import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius as radii, spacing, withAlpha } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Button } from './Button';
import { Panel } from './Surface';
import { Type } from './Type';

export interface ActionSheetItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface Props {
  readonly visible: boolean;
  readonly title: string;
  readonly message?: string;
  readonly actions: ActionSheetItem[];
  readonly onClose: () => void;
}

/** Cross-platform action menu without Android Alert's three-button limit. */
export function ActionSheet({ visible, title, message, actions, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { palette } = useTheme();
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: withAlpha('#000000', 0.48) }]}
        onPress={onClose}
        accessible={false}
      >
        <Pressable
          accessibilityViewIsModal
          accessible={false}
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
        >
          <Panel
            style={[
              styles.sheet,
              { maxHeight: Math.max(240, height - insets.top - insets.bottom - spacing.xl * 2) },
            ]}
            borderRadius={radii.lg}
            borderColor={palette.edgeStrong}
          >
            <View style={styles.heading}>
              <Type role="title" pressed>
                {title}
              </Type>
              {message ? <Type role="caption">{message}</Type> : null}
            </View>
            <ScrollView
              style={styles.actionScroll}
              contentContainerStyle={styles.actions}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {actions.map((action) => (
                <Button
                  key={action.label}
                  label={action.label}
                  variant={action.destructive ? 'danger' : 'secondary'}
                  size="md"
                  fullWidth
                  onPress={() => {
                    onClose();
                    action.onPress();
                  }}
                />
              ))}
              <Button label="Cancel" variant="plain" size="md" fullWidth onPress={onClose} />
            </ScrollView>
          </Panel>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    paddingHorizontal: spacing.md,
  },
  sheet: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heading: {
    gap: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
  },
  actionScroll: {
    flexShrink: 1,
  },
});
