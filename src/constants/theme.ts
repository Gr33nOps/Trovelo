import { Platform, TextStyle, ViewStyle } from 'react-native';

import { AccentId } from '../types';

/**
 * Trovelo — Quiet Minimal
 *
 * One page colour, one ink scale, one accent. Type is a single sans family
 * with size/weight hierarchy. Layout uses a fixed horizontal inset and an
 * 8pt vertical rhythm so every screen aligns.
 */

export type Mood = 'light' | 'dark';

export interface Gradient {
  colors: [string, string, ...string[]];
  locations?: [number, number, ...number[]];
}

export interface Palette {
  mood: Mood;
  backdrop: string;
  backdropGradient: Gradient;
  backdropTextureOpacity: number;
  panel: string;
  panelGradient: Gradient;
  panelTextureOpacity: number;
  well: string;
  wellGradient: Gradient;
  chromeGradient: Gradient;
  chromeBorder: string;
  chromeInk: string;
  edge: string;
  edgeStrong: string;
  bevelTop: string;
  bevelBottom: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  emboss: string;
  embossOnAccent: string;
  accent: string;
  accentInk: string;
  accentGradient: Gradient;
  accentEdge: string;
  danger: string;
  dangerGradient: Gradient;
  dangerEdge: string;
  shadow: string;
  scrim: string;
  switchOff: string;
}

function flat(color: string): Gradient {
  return { colors: [color, color] };
}

const LIGHT: Palette = {
  mood: 'light',
  backdrop: '#FAFAF8',
  backdropGradient: flat('#FAFAF8'),
  backdropTextureOpacity: 0,
  panel: '#FFFFFF',
  panelGradient: flat('#FFFFFF'),
  panelTextureOpacity: 0,
  well: '#F0EFEC',
  wellGradient: flat('#F0EFEC'),
  chromeGradient: flat('#FAFAF8'),
  chromeBorder: '#E8E6E1',
  chromeInk: '#111110',
  edge: '#E8E6E1',
  edgeStrong: '#D9D7D1',
  bevelTop: 'transparent',
  bevelBottom: 'rgba(17, 17, 16, 0.05)',
  ink: '#111110',
  inkSoft: '#5C5B57',
  inkFaint: '#8E8C86',
  emboss: 'transparent',
  embossOnAccent: 'transparent',
  accent: '#8B6914',
  accentInk: '#FFFFFF',
  accentGradient: flat('#8B6914'),
  accentEdge: '#6B5010',
  danger: '#B42318',
  dangerGradient: flat('#B42318'),
  dangerEdge: '#7A180F',
  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.45)',
  switchOff: '#D9D7D1',
};

const DARK: Palette = {
  mood: 'dark',
  backdrop: '#121211',
  backdropGradient: flat('#121211'),
  backdropTextureOpacity: 0,
  panel: '#1C1C1A',
  panelGradient: flat('#1C1C1A'),
  panelTextureOpacity: 0,
  well: '#0C0C0B',
  wellGradient: flat('#0C0C0B'),
  chromeGradient: flat('#121211'),
  chromeBorder: '#2A2A27',
  chromeInk: '#F5F4F0',
  edge: '#2A2A27',
  edgeStrong: '#3A3A36',
  bevelTop: 'transparent',
  bevelBottom: 'rgba(255, 255, 255, 0.06)',
  ink: '#F5F4F0',
  inkSoft: '#A8A69F',
  inkFaint: '#6F6D66',
  emboss: 'transparent',
  embossOnAccent: 'transparent',
  accent: '#E0B84A',
  accentInk: '#121211',
  accentGradient: flat('#E0B84A'),
  accentEdge: '#8B6914',
  danger: '#F97066',
  dangerGradient: flat('#F97066'),
  dangerEdge: '#7A180F',
  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.65)',
  switchOff: '#3A3A36',
};

export const palettes: Record<Mood, Palette> = { light: LIGHT, dark: DARK };

export const ACCENT_COLORS: { id: AccentId; label: string; light: string; dark: string }[] = [
  { id: 'gold', label: 'Gold', light: '#8B6914', dark: '#E0B84A' },
  { id: 'green', label: 'Green', light: '#2F6A38', dark: '#7CC687' },
  { id: 'blue', label: 'Blue', light: '#2A5480', dark: '#8FBAE4' },
  { id: 'purple', label: 'Purple', light: '#6B4A96', dark: '#C6A8E8' },
  { id: 'teal', label: 'Teal', light: '#1F7A6C', dark: '#5FC9B8' },
  { id: 'rose', label: 'Rose', light: '#A23E5A', dark: '#E8A0C4' },
];

export const DEFAULT_ACCENT_ID: AccentId = 'gold';

function shade(hex: string, amount: number): string {
  const full = hex.replace('#', '');
  const channel = (i: number) =>
    Math.max(0, Math.min(255, Math.round(parseInt(full.slice(i, i + 2), 16) * (1 - amount))))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

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

/** Fixed page inset — every screen uses this so columns align. */
export const PAGE_PAD = 24;

/** 8pt rhythm. */
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
  xs: 4,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const fontSizes = {
  xxs: 12,
  xs: 13,
  sm: 15,
  md: 17,
  lg: 20,
  xl: 28,
  xxl: 34,
  hero: 40,
} as const;

/** Single family. Display roles use the same sans at larger sizes. */
export const fonts = {
  display: 'SourceSans3_600SemiBold',
  displayRegular: 'SourceSans3_400Regular',
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

export function letterpress(_palette: Palette, _onAccent = false): TextStyle {
  return {};
}

export type ElevationLevel = 'flat' | 'raised' | 'floating' | 'modal';

export function elevation(palette: Palette, level: ElevationLevel): ViewStyle {
  if (level === 'flat' || level === 'raised') return {};
  const spec = {
    floating: { h: 2, o: 0.08, r: 8, e: 2 },
    modal: { h: 8, o: 0.16, r: 24, e: 12 },
  }[level];
  return {
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: spec.h },
    shadowOpacity: palette.mood === 'dark' ? Math.min(1, spec.o * 1.4) : spec.o,
    shadowRadius: spec.r,
    elevation: spec.e,
  };
}

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
  return luminance(background) > 0.199 ? '#111110' : '#FAFAF8';
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
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'mono';

export function textStyle(role: TextRole, palette: Palette): TextStyle {
  const base: Record<TextRole, TextStyle> = {
    hero: {
      fontFamily: fonts.display,
      fontSize: fontSizes.hero,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 46,
      letterSpacing: -0.8,
    },
    display: {
      fontFamily: fonts.display,
      fontSize: fontSizes.xxl,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 40,
      letterSpacing: -0.6,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: fontSizes.xl,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 34,
      letterSpacing: -0.4,
    },
    heading: {
      fontFamily: fonts.bodySemibold,
      fontSize: fontSizes.lg,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 26,
      letterSpacing: -0.2,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: weights.regular,
      color: palette.ink,
      lineHeight: 26,
    },
    bodyStrong: {
      fontFamily: fonts.bodySemibold,
      fontSize: fontSizes.md,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 26,
    },
    caption: {
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: weights.regular,
      color: palette.inkSoft,
      lineHeight: 21,
    },
    label: {
      fontFamily: fonts.bodyMedium,
      fontSize: fontSizes.xs,
      fontWeight: weights.medium,
      color: palette.inkFaint,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      lineHeight: 16,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: fontSizes.sm,
      fontWeight: weights.regular,
      color: palette.inkSoft,
      lineHeight: 21,
    },
  };
  return base[role];
}

export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;
export const MIN_TOUCH = 44;
