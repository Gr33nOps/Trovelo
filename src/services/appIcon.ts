import { NativeModules, Platform } from 'react-native';

import { AccentId } from '../types';

const { AppIcon } = NativeModules;

/** The native module is Android-only; this does not exist on other platforms. */
export const appIconModuleAvailable: boolean = AppIcon != null && Platform.OS === 'android';

/** Every launcher icon alias declared in AndroidManifest.xml, keyed the same way the app itself is: accent × light/dark. */
const ICON_NAMES: Record<AccentId, { light: string; dark: string }> = {
  gold: { light: 'IconGoldLight', dark: 'IconGoldDark' },
  green: { light: 'IconGreenLight', dark: 'IconGreenDark' },
  blue: { light: 'IconBlueLight', dark: 'IconBlueDark' },
  purple: { light: 'IconPurpleLight', dark: 'IconPurpleDark' },
  teal: { light: 'IconTealLight', dark: 'IconTealDark' },
  rose: { light: 'IconRoseLight', dark: 'IconRoseDark' },
};

/** The alias left enabled in the manifest by default. */
export const DEFAULT_ICON_NAME = 'IconGoldDark';

export function iconNameFor(accentId: AccentId, isDark: boolean): string {
  return isDark ? ICON_NAMES[accentId].dark : ICON_NAMES[accentId].light;
}

/** The accent/mode pair a given alias name represents, for rendering the picker. */
export function accentForIconName(name: string): { accentId: AccentId; isDark: boolean } | null {
  for (const accentId of Object.keys(ICON_NAMES) as AccentId[]) {
    if (ICON_NAMES[accentId].dark === name) return { accentId, isDark: true };
    if (ICON_NAMES[accentId].light === name) return { accentId, isDark: false };
  }
  return null;
}

/** Every accent, in the app's own display order, for laying out the picker. */
export const ICON_ACCENT_ORDER: readonly AccentId[] = ['gold', 'green', 'blue', 'purple', 'teal', 'rose'];

/** Switches the home-screen launcher icon. No-ops off Android. */
export async function setAppIcon(accentId: AccentId, isDark: boolean): Promise<void> {
  if (!appIconModuleAvailable) return;
  await AppIcon.setIcon(iconNameFor(accentId, isDark));
}

/** Which alias is currently enabled. Falls back to the manifest default off Android or on error. */
export async function getAppIcon(): Promise<string> {
  if (!appIconModuleAvailable) return DEFAULT_ICON_NAME;
  try {
    return await AppIcon.getIcon();
  } catch {
    return DEFAULT_ICON_NAME;
  }
}
