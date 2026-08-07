import { Platform, TextStyle, ViewStyle } from 'react-native';

import { AccentId } from '../types';

/**
 * Trovelo design language: "Plain".
 *
 * Flat, neutral surfaces (true gray, not tinted), one typeface, and shadow
 * used only where something genuinely sits above the page (a toast, a hero
 * card). Nothing is textured, gradient-filled or drawn to look like a
 * physical object. Depth comes from a thin border and a small lightness step
 * between a surface and what's under it, not from bevels or gloss.
 *
 * The whole app reduces to three colours: black-or-white text, one neutral
 * background per mode, and a single accent. The accent is spent sparingly — on
 * the things that earn it, like a primary action, an active filter or a
 * highlight — rather than on every icon and fill, which is what keeps the
 * chrome quiet. It is the one thing the user picks, in Settings; light and
 * dark mode each just pick the right shade of it.
 *
 * All of it is expressed through the tokens below rather than ad-hoc styles,
 * so light and dark stay consistent and the whole app can be re-skinned from
 * one file. `Gradient` still exists as a type because a few surfaces (the
 * hero card, the door of a progress bar) are still painted with
 * `expo-linear-gradient`, but every value below uses two identical stops, so
 * what actually renders is a flat fill.
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

  backdrop: '#F2F2F2',
  backdropGradient: flat('#F2F2F2'),
  backdropTextureOpacity: 0,

  panel: '#FFFFFF',
  panelGradient: flat('#FFFFFF'),
  panelTextureOpacity: 0,

  well: '#E8E8E8',
  wellGradient: flat('#E8E8E8'),

  chromeGradient: flat('#F2F2F2'),
  chromeBorder: '#DCDCDC',
  chromeInk: '#181818',

  edge: '#DCDCDC',
  edgeStrong: '#C7C7C7',
  bevelTop: 'transparent',
  bevelBottom: 'rgba(0, 0, 0, 0.06)',

  ink: '#181818',
  inkSoft: '#5A5A5A',
  inkFaint: '#8A8A8A',
  emboss: 'transparent',
  embossOnAccent: 'transparent',

  // Placeholder; buildPalette() overwrites accent/accentInk/accentGradient/
  // accentEdge with whatever the user picked from ACCENT_COLORS.
  accent: '#8A6114',
  accentInk: '#FFFFFF',
  accentGradient: flat('#8A6114'),
  accentEdge: '#6B4710',

  danger: '#9A2E22',
  dangerGradient: flat('#9A2E22'),
  dangerEdge: '#6E2117',

  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.5)',
  switchOff: '#D0D0D0',
};

const DARK: Palette = {
  mood: 'dark',

  backdrop: '#141414',
  backdropGradient: flat('#141414'),
  backdropTextureOpacity: 0,

  panel: '#1E1E1E',
  panelGradient: flat('#1E1E1E'),
  panelTextureOpacity: 0,

  well: '#0E0E0E',
  wellGradient: flat('#0E0E0E'),

  chromeGradient: flat('#141414'),
  chromeBorder: '#2E2E2E',
  chromeInk: '#F2F2F2',

  edge: '#2E2E2E',
  edgeStrong: '#3D3D3D',
  bevelTop: 'transparent',
  bevelBottom: 'rgba(255, 255, 255, 0.07)',

  ink: '#F2F2F2',
  inkSoft: '#B4B4B4',
  inkFaint: '#7E7E7E',
  emboss: 'transparent',
  embossOnAccent: 'transparent',

  accent: '#E0A93F',
  accentInk: '#000000',
  accentGradient: flat('#E0A93F'),
  accentEdge: '#6E4A0E',

  danger: '#E88472',
  dangerGradient: flat('#E88472'),
  dangerEdge: '#5F1D12',

  shadow: '#000000',
  scrim: 'rgba(0, 0, 0, 0.65)',
  switchOff: '#3A3A3A',
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
  { id: 'gold', label: 'Gold', light: '#8A6114', dark: '#E0A93F' },
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

/** 4pt rhythm. */
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
  xs: 3,
  sm: 6,
  md: 9,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const fontSizes = {
  xxs: 11,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  hero: 40,
} as const;

/**
 * One typeface, the platform system font, used for everything. Hierarchy
 * comes from size and weight rather than switching families, which is what
 * keeps a plain interface feeling deliberate instead of just unstyled.
 */
export const fonts = {
  display: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
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
  | 'mono';

export function textStyle(role: TextRole, palette: Palette): TextStyle {
  const base: Record<TextRole, TextStyle> = {
    hero: {
      fontFamily: fonts.display,
      fontSize: fontSizes.hero,
      fontWeight: weights.bold,
      color: palette.ink,
      lineHeight: 46,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: fontSizes.xl,
      fontWeight: weights.bold,
      color: palette.ink,
      lineHeight: 29,
    },
    heading: {
      fontFamily: fonts.display,
      fontSize: fontSizes.lg,
      fontWeight: weights.bold,
      color: palette.ink,
      lineHeight: 24,
    },
    body: {
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: weights.regular,
      color: palette.ink,
      lineHeight: 24,
    },
    bodyStrong: {
      fontFamily: fonts.body,
      fontSize: fontSizes.md,
      fontWeight: weights.semibold,
      color: palette.ink,
      lineHeight: 24,
    },
    caption: {
      fontFamily: fonts.body,
      fontSize: fontSizes.sm,
      fontWeight: weights.regular,
      color: palette.inkSoft,
      lineHeight: 20,
    },
    label: {
      fontFamily: fonts.body,
      fontSize: fontSizes.xs,
      fontWeight: weights.semibold,
      color: palette.inkSoft,
      letterSpacing: 0.2,
      lineHeight: 16,
    },
    mono: {
      fontFamily: fonts.mono,
      fontSize: fontSizes.sm,
      fontWeight: weights.regular,
      color: palette.inkSoft,
      lineHeight: 20,
    },
  };
  return base[role];
}

/** Minimum tappable size (WCAG 2.5.5 / platform HIG). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 44;
