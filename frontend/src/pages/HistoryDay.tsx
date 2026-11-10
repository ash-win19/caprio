import { Link, Navigate, useParams } from 'react-router-dom';
import { Page } from '@/components/PageLayout';
import { MissingTaskNames, WrapUpNote } from '@/components/WrapUpNote';
import { ThreadEntry } from '@/components/workflow/ChatMessages';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import { isValidDate } from '@/lib/date';
import { OUTCOMES, type Outcome } from '@/lib/outcomes';
import { useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import type { BackendTask, Workflow } from '@/lib/api';

// The outcome a past Day recorded for a task when it ended.
function outcomeOf(task: BackendTask): Outcome | null {
  if (task.completed || task.status === 'completed') return 'done';
  if (task.status === 'dropped') return 'dropped';
  return task.status === 'planned' ? 'carried' : null;
}

// How the person wrapped the Day up. A Day continued after Wrap up ends a
// second time through Rollover, with no note; the person's Wrap up still stands.
function wrapUp(day: Workflow) {
  const own = (day.reviewHistory?.length ? day.reviewHistory.map(entry => entry.review) : day.review ? [day.review] : []).filter(review => !review.automatic);
  return { wrappedUp: own.length > 0, note: own.at(-1)?.notes ?? '' };
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
          : day.taskDetailsAvailable === false ? <MissingTaskNames />
          : <div className="history-groups">
            {OUTCOMES.map(outcome => ({ ...outcome, tasks: day.tasks.filter(task => outcomeOf(task) === outcome.key) })).filter(group => group.tasks.length > 0).map(group => <section key={group.key} aria-label={group.label} className={group.className}>
              <h2>{group.label}</h2>
              <ul>{group.tasks.map(task => <li key={task.id}>{task.title}</li>)}</ul>
            </section>)}
          </div>}
        {ended && <WrapUpNote {...wrapUp(day)} />}
        <section aria-label="Conversation" className="history-conversation">
          <h2>Conversation</h2>
          {thread.length ? <div className="space-y-5">{thread.map(message => <ThreadEntry key={message.id} message={message} />)}</div> : <p className="list-empty">No conversation that day.</p>}
        </section>
      </>}
  </Page>;
}
