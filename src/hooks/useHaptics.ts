import { useMemo } from 'react';
import { Platform } from 'react-native';
import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
} from 'expo-haptics';

import { useSettings } from '../context/SettingsContext';

export interface Haptics {
  light: () => void;
  soft: () => void;
  medium: () => void;
  success: () => void;
  warning: () => void;
}

const NOOP: Haptics = {
  light: () => {},
  soft: () => {},
  medium: () => {},
  success: () => {},
  warning: () => {},
};

const REAL: Haptics = {
  light: () => void impactAsync(ImpactFeedbackStyle.Light).catch(() => {}),
  soft: () => void impactAsync(ImpactFeedbackStyle.Soft).catch(() => {}),
  medium: () => void impactAsync(ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => void notificationAsync(NotificationFeedbackType.Success).catch(() => {}),
  warning: () => void notificationAsync(NotificationFeedbackType.Warning).catch(() => {}),
};

/**
 * Haptics that never throw, and that honour the user's preference.
 *
 * Constant buzzing is unpleasant or disorienting for some people, so this is a
 * real switch in Settings rather than something the app decides for them.
 */
export function useHaptics(): Haptics {
  const { hapticsEnabled } = useSettings();
  const supported = Platform.OS === 'ios' || Platform.OS === 'android';
  return useMemo(() => (hapticsEnabled && supported ? REAL : NOOP), [hapticsEnabled, supported]);
}
