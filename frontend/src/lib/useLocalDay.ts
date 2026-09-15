import { useEffect, useState } from 'react';
import { localDate } from './date';

/** Recheck when the app wakes, and at midnight even when it stays open. */
export function useLocalDay() {
  const [day, setDay] = useState(localDate);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      setDay(localDate());
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(update, Math.min(midnight.getTime() - now.getTime() + 50, 60_000));
    };
    update();
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  return day;
}
