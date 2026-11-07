import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Workflow } from '@/lib/api';
import { dateLabel, followingDate } from './dates';
import { localDate } from '@/lib/date';

const KNOWN_ERRORS: Record<string, string> = {
  'tomorrow is already closed': "The next calendar day is already closed, so these tasks cannot move there. Choose Done or Drop, or go back and leave this review open.",
  'Internal server error': 'Something went wrong on our end. Please try again.',
  'the planning assistant is not configured': 'Planning isn’t available right now. Please try again in a moment.',
  'the planning model is overloaded or timed out; try again or switch models': 'The planning model is busy or timed out. Try again, or switch to Groq in the model picker.',
};

export type WorkflowErrorCategory = 'capacity' | 'validation' | 'auth' | 'model' | 'generic';

function workflowErrorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** Classify API/workflow failures into human-facing buckets. */
export function workflowErrorCategory(error: unknown): WorkflowErrorCategory {
  const code = workflowErrorCode(error);
  if (code === 'auth') return 'auth';
  if (code === 'over_capacity' || code === 'plan_incomplete' || code === 'validation') return 'validation';
  if (code === 'model_unavailable') return 'model';
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : NaN;
  const message = error instanceof Error ? error.message : '';
  if (status === 401 || status === 403 || /session expired|unauthorized|forbidden/i.test(message)) return 'auth';
  if (
    status === 503 || status === 429 || status === 502 || status === 504
    || /overload|timed?\s*out|timeout|capacity|rate.?limit|unavailable|too many requests|model is overloaded/i.test(message)
  ) {
    return 'capacity';
  }
  if (
    status === 400
    || /failed validation|proposal omitted|exceed the available time|invalid proposal|unknown, completed, or repeated task|invalid date|must contain/i.test(message)
  ) {
    return 'validation';
  }
  if (/mastra|planning model|model.*(down|unavailable)|provider/i.test(message)) return 'model';
  return 'generic';
}

export function workflowErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';
  const code = workflowErrorCode(error);
  if (code === 'plan_update_failed') return 'I couldn’t update the plan. Try again.';
  if (code === 'turn_in_progress') return 'Still replying to your last message.';
  if (code === 'over_capacity' || code === 'validation' || code === 'conflict') return KNOWN_ERRORS[error.message] || error.message;
  if (KNOWN_ERRORS[error.message]) return KNOWN_ERRORS[error.message];

  const category = workflowErrorCategory(error);
  if (category === 'auth') {
    return 'Your session expired. Sign in again to continue.';
  }
  if (category === 'capacity') {
    if (/planning model is overloaded/i.test(error.message)) return KNOWN_ERRORS['the planning model is overloaded or timed out; try again or switch models'];
    if (/planning assistant is not configured/i.test(error.message)) return KNOWN_ERRORS['the planning assistant is not configured'];
    return 'The planning model is busy or timed out. Try again, or switch models.';
  }
  if (category === 'validation' || /failed validation/i.test(error.message)) {
    if (/failed validation/i.test(error.message)) {
      return 'The proposed plan wasn’t complete enough to save. Tell Caprio what to include or drop, then try again.';
    }
    if (/proposal omitted|exceed the available time|invalid proposal|unknown, completed, or repeated task/i.test(error.message)) {
      return 'That plan couldn’t be validated. Adjust the tasks or available time, then ask for another proposal.';
    }
  }
  if (category === 'model') {
    return 'The planning model couldn’t answer. Try again or switch models.';
  }
  if (KNOWN_ERRORS[error.message]) return KNOWN_ERRORS[error.message];
  return error.message;
}

export function WorkflowError({ error, retry }: { error: unknown; retry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
    <p className="text-destructive">{workflowErrorMessage(error)}</p>
    {retry && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>Try again</Button>}
  </div>;
}

export function DaySummary({ workflow }: { workflow: Workflow }) {
  const review = workflow.review;
  const destination = review?.carriedToDate || followingDate(workflow.date);
  const carriedCount = review?.carriedToTomorrowCount ?? 0;
  const recovering = destination < localDate() && carriedCount > 0;
  const nextPath = recovering ? `/review?date=${destination}&reopen=1` : destination < localDate() ? '/new' : `/new?date=${destination}`;
  const nextLabel = recovering ? `Review ${dateLabel(destination)}` : destination < localDate() ? 'Return to today' : 'Plan the next day';
  const done = workflow.tasks.filter(task => task.completed || task.status === 'completed');
  const dropped = workflow.tasks.filter(task => !task.completed && task.status === 'dropped');
  const carried = workflow.tasks.filter(task => !task.completed && task.status === 'planned' && task.plannedForDate === destination);
  const groups = [{ label: 'Done', tasks: done }, { label: `Carried to ${dateLabel(destination)}`, tasks: carried }, { label: 'Dropped', tasks: dropped }];
  return <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
    <CheckCircle2 className="mb-4 h-8 w-8 text-primary" />
    <h2 className="text-xl font-medium">Day closed</h2>
    <p className="mt-2 text-sm text-muted-foreground">{review?.automatic ? `Unchecked tasks from ${dateLabel(workflow.date)} were carried forward automatically. Completed work stays recorded here.` : `Your review for ${dateLabel(workflow.date)} is saved.`}</p>
    {review && <>
      <dl className="my-6 grid grid-cols-3 gap-3">
        {[[review.completedCount, 'Completed'], [review.carriedToTomorrowCount, 'Carried forward'], [review.droppedCount, 'Dropped']].map(([count, label]) => <div key={label}>
          <dd className="text-2xl font-medium">{count}</dd><dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
        </div>)}
      </dl>
      {review.notes && <p className="mb-5 whitespace-pre-wrap text-sm text-muted-foreground">{review.notes}</p>}
    </>}
    {workflow.taskDetailsAvailable === false
      ? <p className="mb-5 text-sm text-muted-foreground">Task details were not recorded for this older review. The saved totals are shown above.</p>
      : <div className="mb-6 space-y-5">{groups.map(({ label, tasks }) => <section key={label} aria-label={label}>
        <h3 className="mb-2 text-sm font-medium">{label}</h3>
        {tasks.length > 0 ? <ul className="space-y-2">{tasks.map(task => <li key={task.id} className="rounded-lg bg-muted px-3 py-2 text-sm">{task.title}</li>)}</ul> : <p className="text-xs text-muted-foreground">No tasks</p>}
      </section>)}</div>}
    <p className="mb-5 text-sm text-muted-foreground">{carriedCount > 0 ? `Carried tasks are saved for ${dateLabel(destination)}. Unchecked tasks continue forward until you finish or remove them.` : 'Nothing was carried from this day.'}</p>
    <ReviewHistory workflow={workflow} />
    <div className="flex flex-wrap gap-3">
      <Button asChild><Link to={nextPath}>{nextLabel} <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      <Button asChild variant="outline"><Link to="/momentum">View history</Link></Button>
    </div>
  </section>;
}

export function ReviewHistory({ workflow }: { workflow: Workflow }) {
  const reviews = workflow.state === 'closed' ? workflow.reviewHistory?.slice(0, -1) : workflow.reviewHistory;
  if (!reviews?.length) return null;
  return <section aria-label="Earlier reviews" className="my-6 space-y-3">
    <h3 className="text-sm font-medium">Earlier reviews</h3>
    {reviews.map((entry, index) => <details key={entry.id} className="workspace-details rounded-xl border border-border p-4">
      <summary>Review {index + 1}<span className="ml-2 text-xs text-muted-foreground">{entry.review.completedCount} completed · {entry.review.carriedToTomorrowCount} carried</span></summary>
      <p className="mt-3 text-xs text-muted-foreground">Saved {new Date(entry.createdAt).toLocaleString()}. This records the day at that review.</p>
      {entry.review.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.review.notes}</p>}
      {entry.taskDetailsAvailable ? <ul className="mt-3 space-y-2 text-sm">{entry.tasks.map(task => <li key={task.id}>{task.title}<span className="ml-2 text-xs text-muted-foreground">{task.completed ? 'Completed' : task.status === 'dropped' ? 'Dropped' : `Carried to ${dateLabel(task.plannedForDate)}`}</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Task details were not recorded for this review.</p>}
    </details>)}
  </section>;
}
