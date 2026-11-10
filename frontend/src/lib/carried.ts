import type { Task } from './types';

// A Carried task is a Stale task once it has rolled forward this many Days.
// The backend applies the same rule (services/chat/stale.go).
export const STALE_DAYS = 3;

/**
 * How many Days a Carried task has rolled forward to reach `date`, counted
 * from the day it was first planned. Zero for a task that isn't carried; a
 * carried task with no record counts its carries.
 */
export function carriedDays(task: Task, firstPlanned: string | undefined, date: string) {
  if (!task.carriedOver || task.completed) return 0;
  if (!firstPlanned) return task.deferCount ?? 1;
  const days = Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${firstPlanned}T12:00:00`)) / 86_400_000);
  return Math.max(1, days);
}
