import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, radius as radii, spacing } from '../constants/theme';
import { Panel } from '../ui/Surface';
import { Type } from '../ui/Type';
import { useTheme } from './ThemeContext';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  message: string;
  action?: ToastAction;
  /** Milliseconds on screen. Defaults to 3.2s, or 6s when there is an action. */
  duration?: number;
  tone?: 'neutral' | 'success' | 'warning';
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * The toast overlay sits above `NavigationContainer`, as a sibling of the
 * whole navigation tree, so it can show up from any screen (a delete on
 * Library, a save from EntryDetail, and so on). That position means it
 * cannot use `useBottomTabBarHeight()`, which only resolves inside the
 * bottom-tab navigator's own subtree: it is not there to read on a screen
 * that pushed on top of the tabs, and the overlay is not inside the tab
 * navigator's tree at all. This is a fixed estimate of that bar's on-screen
 * height (label + icon + padding, before the safe-area inset, which is added
 * separately below) so the toast cannot land underneath it. It slightly
 * over-clears the bottom on screens that have no tab bar to avoid (Settings'
 * sub-screens, entry detail, and so on), which is a minor extra gap, not a
 * bug like the overlap it replaces.
 */
const TAB_BAR_HEIGHT_ESTIMATE = 56;

/**
 * A single transient message with an optional action, used mainly to make
 * destructive operations undoable instead of asking "are you sure?" every time.
 */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (options: ToastOptions) => {
      clearTimer();
      setToast(options);
      // Screen readers do not see the toast mount, so announce it explicitly.
      AccessibilityInfo.announceForAccessibility?.(options.message);
      const duration = options.duration ?? (options.action ? 6000 : 3200);
      timer.current = setTimeout(() => setToast(null), duration);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo<ToastContextValue>(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastView toast={toast} onDismiss={hide} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { readonly toast: ToastOptions; readonly onDismiss: () => void }) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [enter, toast]);

  const toneColor = toast.tone === 'warning' ? palette.danger : palette.accent;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        { paddingBottom: insets.bottom + TAB_BAR_HEIGHT_ESTIMATE + spacing.sm },
        {
          opacity: enter,
          transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
        },
      ]}
    >
      <Panel
        style={[styles.toast, elevation(palette, 'modal'), { borderColor: palette.edgeStrong }]}
        borderRadius={radii.lg}
        level="modal"
      >
        <View style={[styles.tone, { backgroundColor: toneColor }]} />
        <Type role="caption" color={palette.ink} style={styles.message} numberOfLines={3}>
          {toast.message}
        </Type>
        {toast.action ? (
          <Pressable
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            hitSlop={12}
            style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Type role="caption" color={palette.accent} style={styles.actionLabel}>
              {toast.action.label}
            </Type>
          </Pressable>
        ) : null}
      </Panel>
    </Animated.View>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    ...Platform.select({ web: { position: 'fixed' as 'absolute' }, default: {} }),
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    paddingLeft: spacing.lg,
  },
  tone: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  message: {
    flex: 1,
    lineHeight: 19,
  },
  action: {
    paddingVertical: 4,
  },
  actionLabel: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
