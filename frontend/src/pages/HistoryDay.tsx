import { Link, Navigate, useParams } from 'react-router-dom';
import { Page } from '@/components/PageLayout';
import { ThreadEntry } from '@/components/workflow/ChatMessages';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import { isValidDate } from '@/lib/date';
import { OUTCOMES, type Outcome } from '@/lib/outcomes';
import { useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import type { BackendTask } from '@/lib/api';

// The outcome a past Day's archive recorded for a task.
function outcomeOf(task: BackendTask): Outcome | null {
  if (task.completed || task.status === 'completed') return 'done';
  if (task.status === 'dropped') return 'dropped';
  return task.status === 'planned' ? 'carried' : null;
}

// One past Day, read-only: what happened to its tasks, its Wrap up note, and
// its Conversation. Only Days before today have one.
export default function HistoryDay() {
  const { date = '' } = useParams();
  const today = useLocalDay();
  const past = isValidDate(date) && date < today;
  const workflow = useWorkflow(past ? date : today);
  if (!past) return <Navigate to="/history" replace />;
  const day = workflow.data;
  const ended = day?.state === 'closed';
  const thread = day?.messages ?? [];
  return <Page className="history-page">
    <Link to="/history" className="history-back">← Back to History</Link>
    <header className="list-head">
      <div className="min-w-0">
        <h1>{dateLabel(date, true)}</h1>
        <p className="list-subtitle">Past days are read-only.</p>
      </div>
      <span className="history-pill">Read-only</span>
    </header>
    {workflow.isLoading ? <p role="status" className="py-16 text-center text-sm text-muted-foreground">Loading this day…</p>
      : workflow.error || !day ? <WorkflowError error={workflow.error} retry={() => void workflow.refetch()} />
      : <>
        {!ended || (day.taskDetailsAvailable !== false && day.tasks.length === 0) ? <p className="list-empty">Nothing was recorded for this day.</p>
          : day.taskDetailsAvailable === false ? <p className="history-missing">Task names weren’t recorded for this day.</p>
          : <div className="history-groups">
            {OUTCOMES.map(outcome => ({ ...outcome, tasks: day.tasks.filter(task => outcomeOf(task) === outcome.key) })).filter(group => group.tasks.length > 0).map(group => <section key={group.key} aria-label={group.label} className={group.className}>
              <h2>{group.label}</h2>
              <ul>{group.tasks.map(task => <li key={task.id}>{task.title}</li>)}</ul>
            </section>)}
          </div>}
        {ended && (day.review?.notes ? <p className="history-note">{day.review.notes}</p> : day.review?.automatic && <p className="history-missing">Not wrapped up</p>)}
        <section aria-label="Conversation" className="history-conversation">
          <h2>Conversation</h2>
          {thread.length ? <div className="space-y-5">{thread.map(message => <ThreadEntry key={message.id} message={message} />)}</div> : <p className="list-empty">No conversation that day.</p>}
        </section>
      </>}
  </Page>;
}
