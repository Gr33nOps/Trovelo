export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatRelativeDay(ts: number): string {
  const target = new Date(ts);
  const today = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(target)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatDate(ts);
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function greetingForHour(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Whole days between two timestamps, positive when `ts` is in the future. */
export function daysUntil(ts: number, from: Date = new Date()): number {
  return Math.round((startOfDay(new Date(ts)).getTime() - startOfDay(from).getTime()) / 86400000);
}

/** A short "Due" label: relative for anything within a week, a date after that. */
export function formatDueLabel(ts: number): string {
  const days = daysUntil(ts);
  if (days < 0) return days === -1 ? 'Overdue since yesterday' : `Overdue by ${-days} days`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 7) return `Due in ${days} days`;
  return `Due ${formatDate(ts)}`;
}

/**
 * True when `ts` falls on today's month and day in an earlier year, the
 * "On this day" match. Entries made earlier today do not count: they are not
 * a rediscovery yet.
 */
export function isOnThisDay(ts: number, reference: Date = new Date()): boolean {
  const then = new Date(ts);
  return (
    then.getMonth() === reference.getMonth() &&
    then.getDate() === reference.getDate() &&
    then.getFullYear() !== reference.getFullYear()
  );
}

export function yearsAgo(ts: number, reference: Date = new Date()): number {
  return Math.max(1, reference.getFullYear() - new Date(ts).getFullYear());
}
