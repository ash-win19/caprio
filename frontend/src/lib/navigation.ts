// The app's only tabs. The Conversation isn't one: the entry rule, Today and
// the keyboard shortcut lead there.
export const NAV_ITEMS = [
  { label: 'Today', path: '/today' },
  { label: 'History', path: '/history' },
] as const;
