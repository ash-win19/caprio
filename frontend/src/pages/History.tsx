import { Link } from 'react-router-dom';
import { Page } from '@/components/PageLayout';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import { useHistory } from '@/lib/queries';
import { OUTCOMES } from '@/lib/outcomes';
import { useLocalDay } from '@/lib/useLocalDay';
import type { HistoryDay } from '@/lib/api';

function DayCard({ day }: { day: HistoryDay }) {
  return <li className="history-day">
    <div className="history-day-head">
      <h2><Link to={`/history/${day.date}`}>{dateLabel(day.date)}</Link></h2>
      <p>{day.doneCount} done · {day.carriedCount} carried · {day.droppedCount} dropped</p>
    </div>
    {day.taskNamesAvailable ? <div className="history-outcomes">
      {OUTCOMES.filter(outcome => day[outcome.key].length > 0).map(outcome => <div key={outcome.key} role="group" aria-label={outcome.label} className={`history-outcome ${outcome.className}`}>
        <span aria-hidden>{outcome.label}</span>
        <p>{day[outcome.key].join(', ')}</p>
      </div>)}
    </div> : <p className="history-missing">Task names weren’t recorded for this day.</p>}
    {day.note ? <p className="history-note">{day.note}</p> : !day.wrappedUp && <p className="history-missing">Not wrapped up</p>}
  </li>;
}

// The read-only record of past Days: what was done, carried and dropped, by
// task name, so "what happened to X?" has an answer.
export default function History() {
  const today = useLocalDay();
  const history = useHistory(today);
  return <Page className="history-page">
    <header className="list-head">
      <div className="min-w-0">
        <h1>History</h1>
        <p className="list-subtitle">What happened to each day’s tasks.</p>
      </div>
    </header>
    {history.isLoading ? <p role="status" className="py-16 text-center text-sm text-muted-foreground">Loading your history…</p>
      : history.error ? <WorkflowError error={history.error} retry={() => void history.refetch()} />
      : !history.data?.length ? <p className="list-empty">Your past days will show up here.</p>
      : <ol aria-label="Past days" className="history-days">{history.data.map(day => <DayCard key={day.date} day={day} />)}</ol>}
  </Page>;
}
