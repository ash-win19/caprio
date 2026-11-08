// Whether the person skipped today's Conversation on this device, kept per
// account. Only the last skipped date is stored, so a new day starts unskipped.
// The key predates skipping (it recorded the day's first open) and is kept so
// existing devices don't see this morning's Conversation a second time.
const key = (account: string) => `caprio_day_entry:${account}`;

export function hasSkippedDay(account: string, date: string) {
  return localStorage.getItem(key(account)) === date;
}

export function markDaySkipped(account: string, date: string) {
  localStorage.setItem(key(account), date);
}

// Router state for a link that opens Today on purpose. Choosing Today counts
// as skipping that day's Conversation; the date keeps a link followed
// yesterday from skipping today.
// A Day is confirmed once its first plan is; a wrapped-up Day stays confirmed.
export function isConfirmed(workflow: { state: 'planning' | 'active' | 'closed' } | undefined) {
  return Boolean(workflow && workflow.state !== 'planning');
}

export function openTodayState(date: string) {
  return { openToday: date };
}

export function opensToday(state: unknown, date: string) {
  return (state as { openToday?: string } | null)?.openToday === date;
}
