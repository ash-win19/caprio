// What History records for each task of a past Day, in the order it shows them.
// The class names are written out so the stylesheet build keeps their rules.
export const OUTCOMES = [
  { key: 'done', label: 'Done', className: 'history-done' },
  { key: 'carried', label: 'Carried', className: 'history-carried' },
  { key: 'dropped', label: 'Dropped', className: 'history-dropped' },
] as const;

export type Outcome = typeof OUTCOMES[number]['key'];
