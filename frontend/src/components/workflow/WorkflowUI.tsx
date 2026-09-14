import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Workflow } from '@/lib/api';
import { dateLabel, followingDate } from './dates';

/** Format minutes as compact hours for capacity copy (90 → "1.5h"). */
export function formatHours(minutes: number): string {
  const rounded = Math.round((minutes / 60) * 10) / 10;
  return `${rounded}h`;
}

/** Hard-gate copy when planned today minutes exceed known available minutes. */
export function capacityOverMessage(plannedMinutes: number, availableMinutes: number): string {
  const over = plannedMinutes - availableMinutes;
  return `Plan is ${formatHours(over)} over your ${formatHours(availableMinutes)} day`;
}

const KNOWN_ERRORS: Record<string, string> = {
  'tomorrow is already closed': "Tomorrow is already closed, so these tasks can’t move forward. Drop them from today, or reopen tomorrow before carrying again.",
  'Internal server error': 'Something went wrong on our end. Please try again.',
};

export function workflowErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Something went wrong. Please try again.';
  if (KNOWN_ERRORS[error.message]) return KNOWN_ERRORS[error.message];
  if (/failed validation/i.test(error.message)) {
    return 'The proposed plan wasn’t complete enough to save. Tell Caprio what to include or drop, then try again.';
  }
  if (/proposal omitted|exceed the available time|invalid proposal|unknown, completed, or repeated task/i.test(error.message)) {
    return 'That plan couldn’t be validated. Adjust the tasks or available time, then ask for another proposal.';
  }
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
  return <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
    <CheckCircle2 className="mb-4 h-8 w-8 text-primary" />
    <h2 className="text-xl font-medium">Day closed</h2>
    <p className="mt-2 text-sm text-muted-foreground">Your review for {dateLabel(workflow.date)} is saved.</p>
    {review && <>
      <dl className="my-6 grid grid-cols-3 gap-3">
        {[[review.completedCount, 'Completed'], [review.carriedToTomorrowCount, 'For tomorrow'], [review.droppedCount, 'Dropped']].map(([count, label]) => <div key={label}>
          <dd className="text-2xl font-medium">{count}</dd><dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
        </div>)}
      </dl>
      {review.notes && <p className="mb-5 whitespace-pre-wrap text-sm text-muted-foreground">{review.notes}</p>}
    </>}
    <p className="mb-5 text-sm text-muted-foreground">Carried tasks are ready for tomorrow. Review your available time before committing the next plan.</p>
    <div className="flex flex-wrap gap-3">
      <Button asChild><Link to={`/new?date=${followingDate(workflow.date)}`}>Plan the next day <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      <Button asChild variant="outline"><Link to="/momentum">View history</Link></Button>
    </div>
  </section>;
}
