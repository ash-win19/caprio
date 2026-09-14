import type { ChatSession } from './api';
import { localDate, previousDate } from './date';

/** Oldest → newest local calendar dates ending at `end` (inclusive). */
export function weekDates(end = localDate(), days = 7): string[] {
  const newestFirst: string[] = [];
  let cursor = end;
  for (let i = 0; i < days; i++) {
    newestFirst.push(cursor);
    cursor = previousDate(cursor);
  }
  return newestFirst.reverse();
}

export interface WeekInsight {
  closedDays: number;
  done: number;
  carried: number;
  dropped: number;
  /** True when any history session falls inside the week window. */
  hasAnyDay: boolean;
}

/** Aggregate closed-day outcomes for the last N local days from the sessions list. */
export function summarizeWeek(sessions: ChatSession[], end = localDate(), days = 7): WeekInsight {
  const inWeek = new Set(weekDates(end, days));
  let closedDays = 0;
  let done = 0;
  let carried = 0;
  let dropped = 0;
  let hasAnyDay = false;

  for (const session of sessions) {
    if (!inWeek.has(session.sessionDate)) continue;
    hasAnyDay = true;
    if (session.state !== 'closed') continue;
    closedDays += 1;
    done += session.completedCount ?? 0;
    carried += session.carriedCount ?? 0;
    dropped += session.droppedCount ?? 0;
  }

  return { closedDays, done, carried, dropped, hasAnyDay };
}

export function dayOutcomeLine(session: ChatSession): string | null {
  if (session.state !== 'closed') return null;
  const planned = session.plannedCount ?? ((session.completedCount ?? 0) + (session.carriedCount ?? 0) + (session.droppedCount ?? 0));
  return `${planned} planned · ${session.completedCount ?? 0} done · ${session.carriedCount ?? 0} carried · ${session.droppedCount ?? 0} dropped`;
}
