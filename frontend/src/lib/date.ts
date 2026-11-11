// A plan belongs to the user's calendar day, not the UTC date.
export function localDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

/** Whole calendar days from one date to a later one. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);
}

/**
 * When a Later task is dated for: its weekday within the coming week
 * ("Tuesday"), otherwise the weekday and date ("Sat, Sep 26").
 */
export function laterLabel(date: string, today: string): string {
  return daysBetween(today, date) < 7
    ? weekday(date)
    : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** A date's day of the week, as in "Tuesday". */
export function weekday(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
}

export function nextDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return localDate(date);
}

export function previousDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return localDate(date);
}

