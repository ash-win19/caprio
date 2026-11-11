export function dateLabel(date: string, year = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
}
