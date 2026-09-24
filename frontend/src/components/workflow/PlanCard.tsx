import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowRight, X } from 'lucide-react';
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

function PlanRow({ item, showDate, highlighted }: { item: PlanItem; showDate?: boolean; highlighted: boolean }) {
  const where = item.inbox ? 'Inbox' : item.date ? dateLabel(item.date) : '';
  return <li data-ref={item.ref} data-highlighted={highlighted || undefined} className={`flex items-start justify-between gap-3 rounded-lg bg-background px-3 py-2.5 ${highlighted ? 'plan-row-highlight' : ''}`}>
    <div className="min-w-0 flex-1">
      <p className={`break-words text-sm font-medium ${item.badge === 'removed' ? 'text-muted-foreground line-through' : ''}`}>{item.title}</p>
      {(showDate || item.duration) && <p className="mt-0.5 text-xs text-muted-foreground">{[showDate && where, item.duration && `${item.duration} min`].filter(Boolean).join(' · ')}</p>}
    </div>
    {item.badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${BADGE_CLASS[item.badge]}`}>{BADGE_LABEL[item.badge]}</span>}
  </li>;
}

function Group({ label, items, showDate, highlighted, children }: { label: string; items: PlanItem[]; showDate?: boolean; highlighted: Set<string>; children?: ReactNode }) {
  if (!items.length) return null;
  return <section aria-label={label} className="mt-5">
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}{children}</h3>
    <ol className="space-y-1.5">{items.map(item => <PlanRow key={item.ref} item={item} showDate={showDate} highlighted={highlighted.has(item.ref)} />)}</ol>
  </section>;
}

export function planTitle(date: string) {
  return date === localDate() ? 'Today’s plan' : `Plan for ${dateLabel(date)}`;
}

/** How many rows Confirm would change. */
export function planChangeCount(plan: PlanView) {
  const { counts } = plan;
  return counts.new + counts.edited + counts.moved + counts.removed;
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
export function PlanCard({ plan, date, busy, confirming, discarding, error, highlight, onConfirm, onDiscard, onClose }: {
  plan: PlanView;
  date: string;
  busy: boolean;
  confirming: boolean;
  discarding: boolean;
  error?: ReactNode;
  highlight?: { refs: string[]; nonce: number } | null;
  onConfirm: () => void;
  onDiscard: () => void;
  onClose?: () => void;
}) {
  const summary = planSummary(plan);
  const isToday = date === localDate();
  const highlighted = new Set(highlight?.refs ?? []);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!highlight?.refs.length) return;
    root.current?.querySelector(`[data-ref="${CSS.escape(highlight.refs[0])}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [highlight]);
  return <section ref={root} id="proposed-plan" aria-label="Proposed plan" className="plan-card flex flex-col rounded-2xl border border-primary/30 bg-card">
    <div className="min-h-0 flex-1 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">{planTitle(date)}</h2>
          {summary && <p className="mt-1 text-sm text-muted-foreground">{summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">Needs your confirmation</span>
          {onClose && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close plan"><X size={16} aria-hidden /></Button>}
        </div>
      </div>
      <Group label={isToday ? 'Today' : 'This day'} items={plan.today} highlighted={highlighted} />
      <Group label="Carried forward" items={plan.carried} highlighted={highlighted}><span className="ml-2 normal-case tracking-normal">· kept unless you say otherwise</span></Group>
      <Group label="Other days" items={plan.otherDays} showDate highlighted={highlighted} />
      {plan.doneCount > 0 && <p className="mt-4 text-xs text-muted-foreground">Done · {plan.doneCount}</p>}
      <p className="mt-5 text-xs leading-5 text-muted-foreground">Confirming saves this plan. Completed tasks stay completed.</p>
      {error && <div className="mt-4">{error}</div>}
    </div>
    <div className="plan-card-actions flex flex-wrap gap-2 rounded-b-2xl bg-card px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
      <Button onClick={onConfirm} disabled={busy}>{confirming ? 'Saving plan…' : 'Confirm plan'}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      <Button variant="ghost" onClick={onDiscard} disabled={busy}>{discarding ? 'Discarding…' : 'Discard'}</Button>
    </div>
  </section>;
}
