// Remember only the last opened calendar day, separately for each account.
const key = (account: string) => `caprio_day_entry:${account}`;

export function hasOpenedDay(account: string, date: string) {
  return localStorage.getItem(key(account)) === date;
}

export function markDayOpened(account: string, date: string) {
  localStorage.setItem(key(account), date);
}
