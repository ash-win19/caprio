// How a past Day ended: its Wrap up note, or that it was never wrapped up. A
// Day wrapped up without a note shows nothing.
export function WrapUpNote({ wrappedUp, note }: { wrappedUp: boolean; note: string }) {
  if (note) return <p className="history-note">{note}</p>;
  return wrappedUp ? null : <p className="history-missing">Not wrapped up</p>;
}

export function MissingTaskNames() {
  return <p className="history-missing">Task names weren’t recorded for this day.</p>;
}
