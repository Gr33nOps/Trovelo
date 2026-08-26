import React from 'react';
import { StyleProp, Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

import { TextRole, letterpress, textStyle } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

/** `role` is ours, not the ARIA one. Accessibility uses `accessibilityRole`. */
export interface TypeProps extends Omit<RNTextProps, 'role'> {
  readonly role?: TextRole;
  readonly color?: string;
  /** Stamp the type into the surface. Off for long-form body copy, where it hurts legibility. */
  readonly pressed?: boolean;
  /** Use the shadow tuned for saturated backgrounds. */
  readonly onAccent?: boolean;
  readonly align?: TextStyle['textAlign'];
  readonly style?: StyleProp<TextStyle>;
}

/**
 * Themed text. Centralising this keeps letterpress, colour and the type scale
 * consistent, and means a role change is a one-word edit at the call site.
 */
export function Type({
  role = 'body',
  color,
  pressed = false,
  onAccent = false,
  align,
  style,
  children,
  ...rest
}: TypeProps) {
  const { palette } = useTheme();
  return (
    <RNText
      {...rest}
      style={[
        textStyle(role, palette),
        pressed && letterpress(palette, onAccent),
        color ? { color } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
