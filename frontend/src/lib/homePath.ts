import { previousDate } from './date';

export type WorkflowState = 'planning' | 'active' | 'closed';

/** First meaningful open for local today: close yesterday, else plan or execute. */
export function morningHomePath({
  today,
  yesterdayState,
  todayState,
}: {
  today: string;
  yesterdayState?: WorkflowState | null;
  todayState?: WorkflowState | null;
}): string {
  if (yesterdayState === 'active') {
    return `/review?date=${previousDate(today)}&reopen=1`;
  }
  if (todayState === 'active') return '/today';
  return '/new';
}

/** Block planning/executing today while yesterday is still open. */
export function shouldForceYesterdayReview(
  pathname: string,
  search: string,
  today: string,
  yesterdayState?: WorkflowState | null,
): string | null {
  if (yesterdayState !== 'active') return null;
  const params = new URLSearchParams(search);
  const date = params.get('date');
  const onTodayPath = pathname === '/today' || pathname === '/new';
  if (!onTodayPath) return null;
  if (date && date !== today) return null;
  return `/review?date=${previousDate(today)}&reopen=1`;
}
