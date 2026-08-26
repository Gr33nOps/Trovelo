import React, { ReactNode, forwardRef } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextStyle,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { MIN_TOUCH, fonts, fontSizes, radius as radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { Well } from './Surface';
import { Type } from './Type';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  readonly label?: string;
  readonly hint?: string;
  /** Rendered under the field in the danger colour; also sets the a11y invalid state. */
  readonly error?: string;
  /** Shows `n / max` under the field. Requires `maxLength`. */
  readonly showCounter?: boolean;
  readonly left?: ReactNode;
  readonly right?: ReactNode;
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly inputStyle?: StyleProp<TextStyle>;
  /** `plain` drops the recessed well for editorial screens. */
  readonly variant?: 'well' | 'plain';
}

/**
 * A text input. Default is carved into the surface; `plain` is borderless for
 * the distraction-free editor.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  {
    label,
    hint,
    error,
    showCounter = false,
    left,
    right,
    containerStyle,
    inputStyle,
    multiline,
    maxLength,
    value,
    accessibilityLabel,
    accessibilityHint,
    accessibilityState,
    variant = 'well',
    ...rest
  },
  ref,
) {
  const { palette } = useTheme();
  const length = value?.length ?? 0;
  const nearLimit = maxLength !== undefined && length > maxLength * 0.9;

  const input = (
    <View style={styles.inputRow}>
      {left}
      <TextInput
        ref={ref}
        value={value}
        multiline={multiline}
        maxLength={maxLength}
        placeholderTextColor={palette.inkFaint}
        selectionColor={palette.accent}
        cursorColor={palette.accent}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...rest}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={error ?? accessibilityHint}
        accessibilityState={
          {
            ...accessibilityState,
            invalid: !!error,
          } as TextInputProps['accessibilityState']
        }
        style={[
          styles.input,
          {
            color: palette.ink,
            fontFamily: fonts.body,
            fontSize: fontSizes.md,
            lineHeight: multiline ? 28 : undefined,
            minHeight: multiline ? 140 : MIN_TOUCH - 2,
          },
          inputStyle,
        ]}
      />
      {right}
    </View>
  );

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Type role="label" pressed>
          {label}
        </Type>
      ) : null}

      {variant === 'plain' ? (
        input
      ) : (
        <Well borderRadius={radii.md} style={styles.well}>
          {input}
        </Well>
      )}

      {(hint || error || (showCounter && maxLength !== undefined)) && (
        <View style={styles.footer}>
          <Type
            role="caption"
            color={error ? palette.danger : palette.inkFaint}
            style={styles.footerText}
            accessibilityLiveRegion={error ? 'polite' : 'none'}
          >
            {error ?? hint ?? ''}
          </Type>
          {showCounter && maxLength !== undefined ? (
            <Type
              role="caption"
              color={nearLimit ? palette.danger : palette.inkFaint}
              style={styles.counter}
              accessibilityLabel={`${length} of ${maxLength} characters used`}
            >
              {length} / {maxLength}
            </Type>
          ) : null}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  well: {
    paddingHorizontal: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  footerText: {
    flex: 1,
    lineHeight: 18,
  },
  counter: {
    fontVariant: ['tabular-nums'],
  },
});
