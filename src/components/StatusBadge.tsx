import React from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { STATUS_CONFIG } from '../constants/status';
import { useTheme } from '../context/ThemeContext';
import { EntryStatus } from '../types';
import { Badge } from '../ui/Controls';

export function StatusBadge({ status, compact = false }: { status: EntryStatus; compact?: boolean }) {
  const { palette } = useTheme();
  const config = STATUS_CONFIG[status];
  const color = palette.accent;

  return (
    <Badge
      label={compact ? config.shortLabel : config.label}
      color={color}
      icon={<Ionicons name={config.icon} size={11} color={color} />}
    />
  );
}
