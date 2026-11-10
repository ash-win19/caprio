import { daysBetween } from './date';
import type { Task } from './types';

// A Carried task is a Stale task once it has rolled forward this many Days.
// The backend applies the same rule (services/chat/stale.go).
export const STALE_DAYS = 3;

/**
 * How many Days a Carried task has rolled forward to reach `date`, counted
 * from the day it was first planned. Zero for a task that isn't carried; a
 * carried task with no record counts its carries.
 */
export function daysCarried(task: Task, firstPlanned: string | undefined, date: string) {
  if (!task.carriedOver || task.completed) return 0;
  return firstPlanned ? Math.max(1, daysBetween(firstPlanned, date)) : task.carryCount ?? 1;
}
