// Whether the person skipped today's Conversation on this device, kept per
// account. Only the last skipped date is stored, so a new day starts unskipped.
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
export function openTodayState(date: string) {
  return { openToday: date };
}

export function opensToday(state: unknown, date: string) {
  return (state as { openToday?: string } | null)?.openToday === date;
}
