import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Appearance, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_ACCENT_ID, buildPalette, fonts, radius, spacing } from '../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence.
 *
 * Without this, any render-time throw leaves a blank screen with no way out,
 * and because everything is stored locally, "reinstall the app" would mean
 * losing the user's notes. Recovering in place matters here.
 *
 * Built from plain primitives and a palette resolved at render time rather
 * than from `useTheme()`: the design system reads from context, and context is
 * exactly what may have just failed. `Appearance` is a bare platform API with
 * no such dependency, so honouring dark mode here costs nothing in
 * robustness. The accent falls back to the default, since the user's choice
 * lives behind the provider that may be the thing that broke.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const palette = buildPalette(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light', DEFAULT_ACCENT_ID);

    return (
      <View style={[styles.root, { backgroundColor: palette.backdrop }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[styles.card, { borderColor: palette.edge, backgroundColor: palette.panel }]}
          >
            <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
              Something went wrong
            </Text>
            <Text style={[styles.body, { color: palette.inkSoft }]}>
              Everything you saved is safe. It is stored on this phone and was not touched. Try again, and
              if it keeps happening, make a backup from Settings.
            </Text>
            <Text style={[styles.detail, { color: palette.inkFaint }]} numberOfLines={6}>
              {error.message || String(error)}
            </Text>
            <Pressable
              onPress={() => this.setState({ error: null })}
              accessibilityRole="button"
              accessibilityLabel="Try again"
              style={({ pressed }) => [
                styles.button,
                { borderColor: palette.accentEdge, backgroundColor: palette.accent },
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.buttonLabel, { color: palette.accentInk }]}>Try again</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
  },
  detail: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
  },
  button: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xs,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonLabel: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '600',
  },
});
