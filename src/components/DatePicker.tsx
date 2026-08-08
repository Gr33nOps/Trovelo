import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { contrastingInk, radius as radii, spacing } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { Chip, IconButton } from '../ui/Controls';
import { Well } from '../ui/Surface';
import { Type } from '../ui/Type';
import { addDays, formatDate, startOfDay } from '../utils/date';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

interface Props {
  value?: number;
  onChange: (value: number | undefined) => void;
}

/**
 * A compact due-date picker: quick relative chips for the common cases, and a
 * plain month grid for anything else. No native picker dependency, so it
 * costs nothing in APK size and looks like the rest of the app rather than an
 * OS dialog dropped on top of it.
 */
export function DatePicker({ value, onChange }: Props) {
  const { palette } = useTheme();
  const haptics = useHaptics();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => startOfDay(value ? new Date(value) : new Date()));

  const [today, setToday] = useState(() => startOfDay());
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const nextWeek = useMemo(() => addDays(today, 7), [today]);

  useEffect(() => {
    const refreshToday = () => {
      const next = startOfDay();
      setToday((current) => (sameDay(current, next) ? current : next));
    };
    const timer = setInterval(refreshToday, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshToday();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const pick = (date: Date) => {
    haptics.light();
    onChange(startOfDay(date).getTime());
    setCalendarOpen(false);
  };

  const openCalendar = () => {
    haptics.light();
    setViewDate(startOfDay(value ? new Date(value) : new Date()));
    setCalendarOpen((open) => !open);
  };

  const grid = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const total = daysInMonth(year, month);
    const leading = new Date(year, month, 1).getDay();
    const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= total; day += 1) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewDate]);

  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const selected = value ? startOfDay(new Date(value)) : null;
  const dateChipActive =
    calendarOpen || (!!selected && !sameDay(selected, today) && !sameDay(selected, tomorrow) && !sameDay(selected, nextWeek));

  return (
    <View style={styles.wrap}>
      <View style={styles.chipRow}>
        <Chip label="Today" active={sameDay(selected, today)} onPress={() => pick(today)} />
        <Chip label="Tomorrow" active={sameDay(selected, tomorrow)} onPress={() => pick(tomorrow)} />
        <Chip label="Next week" active={sameDay(selected, nextWeek)} onPress={() => pick(nextWeek)} />
        <Chip
          label={selected && !calendarOpen ? formatDate(selected.getTime()) : 'Pick a date'}
          active={dateChipActive}
          onPress={openCalendar}
          icon={
            <Ionicons
              name="calendar-outline"
              size={13}
              color={dateChipActive ? contrastingInk(palette.accent) : palette.inkSoft}
            />
          }
        />
        {value !== undefined ? (
          <Chip
            label="No due date"
            onPress={() => {
              haptics.light();
              onChange(undefined);
              setCalendarOpen(false);
            }}
          />
        ) : null}
      </View>

      {calendarOpen ? (
        <Well borderRadius={radii.lg} style={styles.calendar}>
          <View style={styles.calendarHeader}>
            <IconButton
              icon="chevron-back"
              label="Previous month"
              size={18}
              onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
            />
            <Type role="bodyStrong" pressed>
              {monthLabel}
            </Type>
            <IconButton
              icon="chevron-forward"
              label="Next month"
              size={18}
              onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
            />
          </View>

          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <View key={index} style={styles.cell}>
                <Type role="caption" color={palette.inkFaint}>
                  {label}
                </Type>
              </View>
            ))}
          </View>

          <View style={styles.weeks}>
            {grid.map((date, index) => {
              if (!date) return <View key={index} style={styles.cell} />;
              const isToday = sameDay(date, today);
              const isSelected = sameDay(date, selected);
              return (
                <Pressable
                  key={index}
                  onPress={() => pick(date)}
                  accessibilityRole="button"
                  accessibilityLabel={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                  style={[
                    styles.cell,
                    styles.dayCell,
                    isSelected
                      ? { backgroundColor: palette.accent, borderRadius: radii.pill }
                      : isToday
                        ? { borderColor: palette.accent, borderWidth: 1, borderRadius: radii.pill }
                        : null,
                  ]}
                >
                  <Type
                    role="caption"
                    color={isSelected ? palette.accentInk : palette.ink}
                    style={isSelected ? styles.dayLabelSelected : undefined}
                  >
                    {date.getDate()}
                  </Type>
                </Pressable>
              );
            })}
          </View>
        </Well>
      ) : null}
    </View>
  );
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  calendar: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weeks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCell: {
    padding: 2,
  },
  dayLabelSelected: {
    fontWeight: '700',
  },
});
