import Ionicons from '@expo/vector-icons/Ionicons';

import { ENTRY_STATUSES, EntryStatus, StatusFilter } from '../types';

export interface StatusConfig {
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Shown on the reveal card to explain what choosing this means. */
  hint: string;
}

export const STATUS_CONFIG: Record<EntryStatus, StatusConfig> = {
  new: {
    label: 'New',
    shortLabel: 'New',
    icon: 'ellipse-outline',
    hint: 'Not looked at yet',
  },
  interesting: {
    label: 'Still interesting',
    shortLabel: 'Keep',
    icon: 'heart',
    hint: 'Worth coming back to',
  },
  done: {
    label: 'Done',
    shortLabel: 'Done',
    icon: 'checkmark-circle',
    hint: 'You acted on it',
  },
  not_useful: {
    label: 'Not for me',
    shortLabel: 'Pass',
    icon: 'archive',
    hint: 'Keep it, but stop surfacing it',
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
