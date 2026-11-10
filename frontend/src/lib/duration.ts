/** Minutes as a short Estimate: "45m", "2h", "3h 40m". */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}
