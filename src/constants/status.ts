import Ionicons from '@expo/vector-icons/Ionicons';

import { ENTRY_STATUSES, EntryStatus, StatusFilter } from '../types';

/**
 * How much visual weight a status chip carries. All three still read off a
 * single accent colour (never a second hue), just used differently: `strong`
 * fills with ink like a settled decision, `accent` borrows the accent the way
 * an outline button does, `muted` stays close to plain text.
 */
export type StatusTone = 'neutral' | 'strong' | 'accent' | 'muted';

export interface StatusConfig {
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Shown on the reveal card to explain what choosing this means. */
  hint: string;
  tone: StatusTone;
}

export const STATUS_CONFIG: Record<EntryStatus, StatusConfig> = {
  new: {
    label: 'New',
    shortLabel: 'New',
    icon: 'ellipse-outline',
    hint: 'Not looked at yet',
    tone: 'neutral',
  },
  interesting: {
    label: 'Still interesting',
    shortLabel: 'Keep',
    icon: 'heart',
    hint: 'Worth coming back to',
    tone: 'accent',
  },
  done: {
    label: 'Done',
    shortLabel: 'Done',
    icon: 'checkmark-circle',
    hint: 'You acted on it',
    tone: 'strong',
  },
  not_useful: {
    label: 'Not for me',
    shortLabel: 'Pass',
    icon: 'archive',
    hint: 'Keep it, but stop surfacing it',
    tone: 'muted',
  },
};

export const STATUS_ORDER: readonly EntryStatus[] = ENTRY_STATUSES;

export interface FilterOption {
  value: StatusFilter;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export const STATUS_FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favourites', icon: 'star' },
  ...STATUS_ORDER.map<FilterOption>((status) => ({
    value: status,
    label: STATUS_CONFIG[status].shortLabel,
    icon: STATUS_CONFIG[status].icon,
  })),
];
