import { isValidDate, nextDate } from '@/lib/date';

export function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export const followingDate = nextDate;

export function selectedDate(value: string | null, fallback: string) {
  return value && isValidDate(value) ? value : fallback;
}
