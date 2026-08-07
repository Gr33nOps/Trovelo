import { Platform, TextStyle, ViewStyle } from 'react-native';

import { AccentId } from '../types';

/**
 * Trovelo design language: "Editorial".
 *
 * Warm cream paper, serif display type for brand and long-form reading,
 * generous sans for UI chrome. Quiet chrome, one gold accent used sparingly
 * (primary actions, active filters). Depth comes from space and hairlines,
 * not cards or shadows.
 */

export type Mood = 'light' | 'dark';

export interface Gradient {
  colors: [string, string, ...string[]];
  locations?: [number, number, ...number[]];
}

export interface Palette {
  mood: Mood;

  /** Page background. */
  backdrop: string;
  backdropGradient: Gradient;
  /** Texture tint strength over the backdrop, 0–1. Kept at 0; the field stays for reference. */
  backdropTextureOpacity: number;

  /** A card, lifted from the backdrop by being lighter (dark) or brighter (light) and a border. */
  panel: string;
  panelGradient: Gradient;
  panelTextureOpacity: number;

  /** A recessed field (inputs, list troughs, progress tracks). */
  well: string;
  wellGradient: Gradient;

  /** Navigation bar. Matches the backdrop; a hairline is what separates it. */
  chromeGradient: Gradient;
  chromeBorder: string;
  chromeInk: string;

  /** Hairlines. */
  edge: string;
  edgeStrong: string;
  /** Unused decoratively; kept only as the press/ripple tint below. */
  bevelTop: string;
  /** Tint for a pressed row or ripple. */
  bevelBottom: string;

  /** Type. Always black-in-light / white-in-dark; never tinted. */
  ink: string;
  inkSoft: string;
  inkFaint: string;
  /** No-op placeholders: letterpress() always returns {}, kept so call sites need no change. */
  emboss: string;
  embossOnAccent: string;

  /**
   * The one accent colour. Used for every icon, chip, fill and highlight in
   * the app; there is no second decorative colour. The user picks which hue
   * from {@link ACCENT_COLORS} in Settings; `accentInk`/`accentEdge` are
   * derived from it automatically so any choice stays legible.
   */
  accent: string;
  accentInk: string;
  accentGradient: Gradient;
  accentEdge: string;

  /** Destructive and urgency signals only (delete, overdue). Not user-chosen. */
  danger: string;
  dangerGradient: Gradient;
  dangerEdge: string;

  /** Misc. */
  shadow: string;
  scrim: string;
  /** react-native Switch track when off. */
  switchOff: string;
}

/** A flat "gradient": both stops the same colour, so LinearGradient paints a solid fill. */
function flat(color: string): Gradient {
  return { colors: [color, color] };
}

const LIGHT: Palette = {
  mood: 'light',

  backdrop: '#F7F5F0',
  backdropGradient: flat('#F7F5F0'),
  backdropTextureOpacity: 0,

  panel: '#F7F5F0',
  panelGradient: flat('#F7F5F0'),
  panelTextureOpacity: 0,

  well: '#EFECE4',
  wellGradient: flat('#EFECE4'),

  chromeGradient: flat('#F7F5F0'),
  chromeBorder: '#E4DFD4',
  chromeInk: '#2C2824',

  edge: '#E4DFD4',
  edgeStrong: '#D4CEC2',
  bevelTop: 'transparent',
  bevelBottom: 'rgba(44, 40, 36, 0.06)',

  ink: '#2C2824',
  inkSoft: '#6F6A62',
  inkFaint: '#9A948A',
  emboss: 'transparent',
  embossOnAccent: 'transparent',

  // Placeholder; buildPalette() overwrites accent/accentInk/accentGradient/
  // accentEdge with whatever the user picked from ACCENT_COLORS.
  accent: '#A07A28',
  accentInk: '#FFFFFF',
  accentGradient: flat('#A07A28'),
  accentEdge: '#7A5C1C',

  danger: '#9A2E22',
  dangerGradient: flat('#9A2E22'),
  dangerEdge: '#6E2117',

  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.5)',
  switchOff: '#D8D2C6',
};

const DARK: Palette = {
  mood: 'dark',

  backdrop: '#1A1814',
  backdropGradient: flat('#1A1814'),
  backdropTextureOpacity: 0,

  panel: '#1A1814',
  panelGradient: flat('#1A1814'),
  panelTextureOpacity: 0,

  well: '#12100E',
  wellGradient: flat('#12100E'),

  chromeGradient: flat('#1A1814'),
  chromeBorder: '#2E2A24',
  chromeInk: '#F2EFE8',

  edge: '#2E2A24',
  edgeStrong: '#3D3830',
  bevelTop: 'transparent',
  bevelBottom: 'rgba(255, 255, 255, 0.07)',

  ink: '#F2EFE8',
  inkSoft: '#B8B2A6',
  inkFaint: '#857E72',
  emboss: 'transparent',
  embossOnAccent: 'transparent',

  accent: '#E0A93F',
  accentInk: '#1A1814',
  accentGradient: flat('#E0A93F'),
  accentEdge: '#6E4A0E',

  danger: '#E88472',
  dangerGradient: flat('#E88472'),
  dangerEdge: '#5F1D12',

  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.65)',
  switchOff: '#3A3530',
};

export const palettes: Record<Mood, Palette> = { light: LIGHT, dark: DARK };

/**
 * The accent choices offered in Settings. Each hue has a light-mode shade
 * (dark and saturated, so white ink sits on it) and a dark-mode shade
 * (bright, so black ink sits on it), the same relationship the previous
 * single, fixed "gold" accent already had. `withAlpha`/`contrastingInk` do
 * the rest, so a new entry here is the only step needed to add a hue.
 */
export const ACCENT_COLORS: { id: AccentId; label: string; light: string; dark: string }[] = [
  { id: 'gold', label: 'Gold', light: '#A07A28', dark: '#E0A93F' },
  { id: 'green', label: 'Green', light: '#2F6A38', dark: '#7CC687' },
  { id: 'blue', label: 'Blue', light: '#2A5480', dark: '#8FBAE4' },
  { id: 'purple', label: 'Purple', light: '#6B4A96', dark: '#C6A8E8' },
  { id: 'teal', label: 'Teal', light: '#1F7A6C', dark: '#5FC9B8' },
  { id: 'rose', label: 'Rose', light: '#A23E5A', dark: '#E8A0C4' },
];

export const DEFAULT_ACCENT_ID: AccentId = 'gold';

/** Blends a hex colour toward black by `amount` (0–1). Used for accentEdge only. */
function shade(hex: string, amount: number): string {
  const full = hex.replace('#', '');
  const channel = (i: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(full.slice(i, i + 2), 16) * (1 - amount))))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/** Builds the full palette for a mode + the user's chosen accent hue. */
export function buildPalette(mood: Mood, accentId: AccentId): Palette {
  const base = palettes[mood];
  const def = ACCENT_COLORS.find((entry) => entry.id === accentId) ?? ACCENT_COLORS[0];
  const accent = mood === 'dark' ? def.dark : def.light;
  return {
    ...base,
    accent,
    accentInk: contrastingInk(accent),
    accentGradient: flat(accent),
    accentEdge: shade(accent, mood === 'dark' ? 0.55 : 0.35),
  };
}

/** 4pt rhythm, with a little extra air for the editorial layout. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 999,
} as const;

/** Comfortably large type — readable on a phone without squinting. */
export const fontSizes = {
  xxs: 13,
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 28,
  xxl: 36,
  hero: 44,
} as const;

/**
 * Serif display for brand titles and surprise reading; Source Sans for UI
 * and body. Fallbacks cover the brief before fonts finish loading.
 */
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayRegular: 'PlayfairDisplay_400Regular',
  body: 'SourceSans3_400Regular',
  bodyMedium: 'SourceSans3_500Medium',
  bodySemibold: 'SourceSans3_600SemiBold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

export const weights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, NonNullable<TextStyle['fontWeight']>>;

/** No-op. Kept so every `pressed`/`onAccent` call site needs no change. */
export function letterpress(_palette: Palette, _onAccent = false): TextStyle {
  return {};
}

export type ElevationLevel = 'flat' | 'raised' | 'floating' | 'modal';

/**
 * Shadow is reserved for things that actually sit above the page: a toast, a
 * hero card. Everything else ('raised', the default for a card) is flat and
 * relies on its border and the small lightness step from the backdrop.
 */
export function elevation(palette: Palette, level: ElevationLevel): ViewStyle {
  if (level === 'flat' || level === 'raised') return {};
  const spec = {
    floating: { h: 2, o: 0.1, r: 8, e: 3 },
    modal: { h: 6, o: 0.2, r: 20, e: 10 },
  }[level];
  return {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: spec.h },
    shadowOpacity: palette.mood === 'dark' ? Math.min(1, spec.o * 1.4) : spec.o,
    shadowRadius: spec.r,
    elevation: spec.e,
  };
}

/** Expands #rgb/#rrggbb into rgba(). Returns the input untouched if it is already functional. */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  const hex = color.slice(1);
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  if (full.length < 6) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Relative luminance per WCAG 2.1, used to pick legible type over an arbitrary
 * status colour instead of always assuming white works.
 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.replace(/./g, (c) => c + c) : value;
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function contrastingInk(background: string): string {
  // The crossover where dark (#241C10) and light (#FFF8EA) ink give equal
  // WCAG contrast against `background` sits at luminance ~0.199, not the
  // halfway-looking 0.42 this used to say.
  return luminance(background) > 0.199 ? '#241C10' : '#FFF8EA';
}

export const TEXTURES = {
  linen: require('../../assets/tex-linen.png'),
  paper: require('../../assets/tex-paper.png'),
  leather: require('../../assets/tex-leather.png'),
  grain: require('../../assets/tex-grain.png'),
} as const;

export type TextureName = keyof typeof TEXTURES;

export type TextRole =
  | 'hero'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'mono'
  | 'display';

export function textStyle(role: TextRole, palette: Palette): TextStyle {
  const base: Record<TextRole, TextStyle> = {
    hero: {
      fontFamily: fonts.display,
      fontSize: fontSizes.hero,
      fontWeight: weights.bold,
      color: palette.ink,
      lineHeight: 52,
      letterSpacing: -0.5,
    },
    display: {
      fontFamily: fonts.display,
      fontSize: fontSizes.xxl,
      fontWeight: weights.bold,
      color: palette.ink,
      lineHeight: 42,
      letterSpacing: -0.3,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: fontSizes.xl,
      fontWeight: weights.bold,
      color: palette.ink,
      lineHeight: 34,
    },
    heading: {
      fontFamily: fonts.bodySemibold,
      fontSize: fontSizes.lg,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 26,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: weights.regular,
      color: palette.ink,
      lineHeight: 28,
    },
    bodyStrong: {
      fontFamily: fonts.bodySemibold,
      fontSize: fontSizes.md,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 28,
    },
    caption: {
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: weights.regular,
      color: palette.inkSoft,
      lineHeight: 22,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.xs,
      fontWeight: weights.medium,
      color: palette.inkSoft,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      lineHeight: 18,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: fontSizes.sm,
      fontWeight: weights.regular,
      color: palette.inkSoft,
      lineHeight: 22,
    },
  };
  return base[role];
}

/** Minimum tappable size (WCAG 2.5.5 / platform HIG). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 44;
