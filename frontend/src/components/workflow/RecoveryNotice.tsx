import { Link } from 'react-router-dom';
import { useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import { isValidDate } from '@/lib/date';
import { dateLabel } from './dates';

export function RecoveryNotice() {
  const today = useLocalDay();
  const query = useWorkflow(today);
  const date = query.data?.oldestUnclosedDate;
  if (!date || !isValidDate(date) || date >= today) return null;
  return <div className="page-notice" role="status">
    <p className="text-sm">You have unfinished work from {dateLabel(date)}. Review it when you're ready.</p>
    <Link className="shrink-0 text-sm font-medium underline underline-offset-4" to={`/review?date=${date}&reopen=1`}>Review unfinished day</Link>
  </div>;
}
