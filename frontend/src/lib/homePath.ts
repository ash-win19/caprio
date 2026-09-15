import { isValidDate } from './date';

export type WorkflowState = 'planning' | 'active' | 'closed';

function recoveryPath(today: string, oldestUnclosedDate?: string | null): string | null {
  return oldestUnclosedDate && isValidDate(oldestUnclosedDate) && oldestUnclosedDate < today
    ? `/review?date=${oldestUnclosedDate}&reopen=1`
    : null;
}

/** Saved tasks can need review without constituting a confirmed plan. */
export function morningHomePath({ today, oldestUnclosedDate, todayState }: {
  today: string;
  oldestUnclosedDate?: string | null;
  todayState?: WorkflowState | null;
}): string {
  const recovery = recoveryPath(today, oldestUnclosedDate);
  if (recovery) return recovery;
  if (todayState === 'active' || todayState === 'closed') return '/today';
  return '/new';
}

/** Resolve older work before entering today's planning or execution pages. */
export function shouldForceOpenDayReview(
  pathname: string,
  search: string,
  today: string,
  oldestUnclosedDate?: string | null,
): string | null {
  if (pathname !== '/today' && pathname !== '/new') return null;
  const date = new URLSearchParams(search).get('date');
  if (date && date !== today) return null;
  return recoveryPath(today, oldestUnclosedDate);
}
