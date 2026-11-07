import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PlanBadge, PlanItem, PlanView } from '@/lib/api';
import { dateLabel } from './dates';
import { localDate } from '@/lib/date';

const BADGE_LABEL: Record<PlanBadge, string> = { new: 'New', edited: 'Edited', moved: 'Moved', removed: 'Removed', done: 'Done' };
const BADGE_CLASS: Record<PlanBadge, string> = {
  new: 'bg-primary/10 text-primary',
  edited: 'bg-accent text-foreground',
  moved: 'bg-accent text-foreground',
  removed: 'bg-destructive/10 text-destructive',
  done: 'bg-accent text-foreground',
};

function PlanRow({ item, showDate }: { item: PlanItem; showDate?: boolean }) {
  const where = item.inbox ? 'Inbox' : item.date ? dateLabel(item.date) : '';
  return <li data-ref={item.ref} className="flex items-start justify-between gap-3 rounded-lg bg-background px-3 py-2.5">
    <div className="min-w-0 flex-1">
      <p className={`break-words text-sm font-medium ${item.badge === 'removed' ? 'text-muted-foreground line-through' : ''}`}>{item.title}</p>
      {(showDate || item.duration) && <p className="mt-0.5 text-xs text-muted-foreground">{[showDate && where, item.duration && `${item.duration} min`].filter(Boolean).join(' · ')}</p>}
    </div>
    {item.badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${BADGE_CLASS[item.badge]}`}>{BADGE_LABEL[item.badge]}</span>}
  </li>;
}

function Group({ label, items, showDate, children }: { label: string; items: PlanItem[]; showDate?: boolean; children?: ReactNode }) {
  if (!items.length) return null;
  return <section aria-label={label} className="mt-5">
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}{children}</h3>
    <ol className="space-y-1.5">{items.map(item => <PlanRow key={item.ref} item={item} showDate={showDate} />)}</ol>
  </section>;
}

export function planSummary(plan: PlanView) {
  const { counts } = plan;
  return [
    counts.new && `${counts.new} new`,
    counts.edited && `${counts.edited} edited`,
    counts.moved && `${counts.moved} moved`,
    counts.removed && `${counts.removed} removed`,
    counts.carried && `${counts.carried} carried`,
  ].filter(Boolean).join(' · ');
}

// The full resulting plan for the day: saved work with the draft applied. The
// app writes every word here; the model's reply stays in the chat.
export function PlanCard({ plan, date, busy, confirming, discarding, error, onConfirm, onDiscard }: {
  plan: PlanView;
  date: string;
  busy: boolean;
  confirming: boolean;
  discarding: boolean;
  error?: ReactNode;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const summary = planSummary(plan);
  const isToday = date === localDate();
  return <section id="proposed-plan" aria-label="Proposed plan" className="rounded-2xl border border-primary/30 bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-medium">{isToday ? 'Today’s plan' : `Plan for ${dateLabel(date)}`}</h2>
        {summary && <p className="mt-1 text-sm text-muted-foreground">{summary}</p>}
      </div>
      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">Needs your confirmation</span>
    </div>
    <Group label={isToday ? 'Today' : 'This day'} items={plan.today} />
    <Group label="Carried forward" items={plan.carried}><span className="ml-2 normal-case tracking-normal">· kept unless you say otherwise</span></Group>
    <Group label="Other days" items={plan.otherDays} showDate />
    {plan.doneCount > 0 && <p className="mt-4 text-xs text-muted-foreground">Done · {plan.doneCount}</p>}
    <p className="mt-5 text-xs leading-5 text-muted-foreground">Confirming saves this plan. Completed tasks stay completed.</p>
    {error && <div className="mt-4">{error}</div>}
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={onConfirm} disabled={busy}>{confirming ? 'Saving plan…' : 'Confirm plan'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      <Button variant="ghost" onClick={onDiscard} disabled={busy}>{discarding ? 'Discarding…' : 'Discard'}</Button>
    </div>
  </section>;
}
