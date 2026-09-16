import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { useLayoutEffect, useRef } from 'react';

import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import { useDateDraft, useNavigationLock } from '@/lib/dateDrafts';
import * as api from '@/lib/api';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel, followingDate, selectedDate } from '@/components/workflow/dates';

type TaskAction = 'done' | 'tomorrow' | 'drop';
const ENERGY = ['Drained', 'Low', 'Steady', 'High', 'Energized'];
const OUTCOMES = [{ action: 'done', label: 'Done', icon: Check }, { action: 'tomorrow', label: 'Tomorrow', icon: ArrowRight }, { action: 'drop', label: 'Drop', icon: X }] as const;

function DayReview({ date, forceCloseBanner }: { date: string; forceCloseBanner: boolean }) {
  const workflowQuery = useWorkflow(date);
  const queryClient = useQueryClient();
  const [step, setStep] = useDateDraft('review-step', date, 0);
  const previousStep = useRef(step);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step;
      stepHeading.current?.scrollIntoView?.({ block: 'start' });
      stepHeading.current?.focus({ preventScroll: true });
    }
  }, [step]);
  const [actions, setActions] = useDateDraft<Record<string, TaskAction>>('review-actions', date, {});
  const [energy, setEnergy] = useDateDraft<number | null>('review-energy', date, null);
  const [notes, setNotes] = useDateDraft('review-notes', date, '');
  const [reflectionOpen, setReflectionOpen] = useDateDraft('review-reflection-open', date, false);
  const [saved, setSaved] = useDateDraft('review-saved', date, false);
  const workflow = workflowQuery.data;
  const tasks = workflow?.tasks || [];
  const today = useLocalDay();
  const destination = followingDate(date);
  const historical = date < today;
  const carryLabel = historical ? `Carry to ${dateLabel(destination)}` : 'Tomorrow';
  const actionFor = (task: api.BackendTask) => task.completed ? 'done' : actions[task.id] || 'tomorrow';
  const allMarked = tasks.every((task) => actionFor(task));
  const unfinished = tasks.filter(task => !task.completed);
  const completed = tasks.filter(task => task.completed);
  const close = useMutation({
    mutationFn: () => api.closeDay({ date, taskActions: tasks.map((task) => ({ taskId: task.id, action: actionFor(task)! })), notes: notes.trim() || undefined, energyLevel: energy ?? undefined }),
    onSuccess: async () => {
      setSaved(true);
      setActions({}); setNotes(''); setEnergy(null); setReflectionOpen(false); setStep(0);
      await Promise.all(['workflow', 'tasks', 'inbox', 'bootstrap', 'chat-sessions'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: () => { void workflowQuery.refetch(); },
  });

  useNavigationLock(close.isPending, workflow?.state !== 'closed' && (Object.keys(actions).length > 0 || Boolean(notes) || energy !== null));

  if (workflowQuery.isLoading) return <p role="status" className="py-12 text-sm text-muted-foreground">Loading your day…</p>;
  if (workflowQuery.error) return <WorkflowError error={workflowQuery.error} retry={() => void workflowQuery.refetch()} />;
  if (!workflow) return null;
  if (workflow.state === 'closed') return <DaySummary workflow={workflow} />;

  const canCloseThisDay = date <= today;
  if (!canCloseThisDay) return <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-medium">This day hasn’t started yet</h2><p className="mt-2 text-sm text-muted-foreground">You can review today and unfinished earlier days. Return here when this day starts.</p><Button asChild className="mt-5"><Link to="/review">Review today</Link></Button></section>;
  if (saved) return <div role="status" className="rounded-xl border border-border p-6"><h2 className="text-xl font-medium">Your review is saved</h2><p className="mt-2 text-sm text-muted-foreground">Loading your day summary…</p><Button variant="outline" className="mt-4" onClick={() => void workflowQuery.refetch()}>Load summary</Button></div>;
  if (workflow.state !== 'active' && tasks.length === 0) return <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-medium">Start with a daily plan</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Once you have saved tasks, come here to save what you finished and what should move forward.</p><Button asChild className="mt-5"><Link to={`/new?date=${historical ? today : date}`}>Plan this day</Link></Button></section>;

  return <>
    {(forceCloseBanner || historical) && <div role="status" className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">{`You are reviewing ${dateLabel(date, true)}. You can return to today at any time.`}</div>}
    <div className="mb-5 flex items-center justify-between gap-4"><h2 ref={stepHeading} tabIndex={-1} className="scroll-mt-36 text-lg font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{step === 0 ? 'Review your tasks' : 'Confirm your day'}</h2><span className="text-xs text-muted-foreground">{step + 1} of 2</span></div>
    {step === 0 ? <>
      <div className="space-y-3">{unfinished.map((task) => {
        return <fieldset key={task.id} className="rounded-xl border border-border bg-card p-4">
          <legend className="sr-only">Outcome for {task.title}</legend>
          <p className="mb-1 text-sm font-medium">{task.title}</p>
          <div className="flex flex-wrap gap-2">{OUTCOMES.map(({ action, label: defaultLabel, icon: Icon }) => {
            const label = action === 'tomorrow' ? carryLabel : defaultLabel;
            return <button key={action} type="button" aria-pressed={actionFor(task) === action} disabled={task.completed && action !== 'done'} aria-label={`${label}: ${task.title}`} onClick={() => setActions((previous) => ({ ...previous, [task.id]: action }))} className={`flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${actionFor(task) === action ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}><Icon size={13} />{label}</button>;
          })}</div>
        </fieldset>;
      })}</div>
      {completed.length > 0 && <details className="workspace-details mt-4"><summary>Already completed · {completed.length}<ChevronDown size={14} aria-hidden /></summary><ul className="mt-2 space-y-2">{completed.map(task => <li key={task.id} className="flex items-start gap-2 text-sm text-muted-foreground"><Check size={16} className="mt-0.5 shrink-0" aria-hidden />{task.title}</li>)}</ul></details>}
      {!unfinished.length && <p className="mt-3 text-sm text-muted-foreground">No unfinished tasks to resolve. Continue to confirm and close this day.</p>}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Unchecked tasks are set to {carryLabel.toLowerCase()} and keep carrying forward until you finish them. Drop removes a task from the plan and keeps its outcome in history. Your choices save together when you close the day.</p>
      <Button onClick={() => setStep(1)} disabled={!allMarked} className="mt-6">Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
    </> : <div className="space-y-6">
      <details open={reflectionOpen} onToggle={event => setReflectionOpen(event.currentTarget.open)} className="workspace-details rounded-xl border border-border bg-card p-4"><summary>Add a reflection <span className="font-normal text-muted-foreground">(optional)</span><ChevronDown size={14} aria-hidden /></summary><div className="mt-4 space-y-5"><div><label htmlFor="review-notes" className="mb-2 block text-sm font-medium">Notes for tomorrow <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea id="review-notes" value={notes} maxLength={8000} onChange={(event) => setNotes(event.target.value)} placeholder="What helped, what got in the way, or what should you remember?" className="min-h-[120px] bg-card" /><p className="mt-2 text-xs text-muted-foreground">These notes are saved with your review.</p></div>
      <fieldset><legend className="mb-3 text-sm font-medium">How was your energy? <span className="font-normal text-muted-foreground">(optional)</span></legend><div className="flex flex-wrap gap-2">{ENERGY.map((label, index) => <button key={label} type="button" aria-pressed={energy === index + 1} onClick={() => setEnergy(energy === index + 1 ? null : index + 1)} className={`min-h-11 rounded-lg border px-3 py-2.5 text-sm ${energy === index + 1 ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>{label}</button>)}</div></fieldset></div></details>
      <div className="rounded-xl bg-muted p-4 text-sm leading-6">{tasks.filter((task) => actionFor(task) === 'done').length} completed · {tasks.filter((task) => actionFor(task) === 'tomorrow').length} moving to {dateLabel(destination)} · {tasks.filter((task) => actionFor(task) === 'drop').length} dropped</div>
      <p className="text-xs leading-5 text-muted-foreground">Closing saves your outcomes and finishes this day. You can return to the summary anytime.</p>
      {close.error && <WorkflowError error={close.error} />}
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setStep(0)} disabled={close.isPending}><ArrowLeft size={15} className="mr-2" />Back</Button><Button onClick={() => close.mutate()} disabled={close.isPending || !allMarked}>{close.isPending ? 'Saving review…' : 'Close day'}</Button></div>
    </div>}
  </>;
}

export default function Review() {
  const [params] = useSearchParams();
  const today = useLocalDay();
  const date = selectedDate(params.get('date'), today);
  const workflow = useWorkflow(date);
  const forceCloseBanner = params.get('reopen') === '1';
  return <Page>
    <PageHeader title="Review" date={date} maxDate={today} status={workflow.data ? workflow.data.state === 'closed' ? 'Closed' : 'Open' : undefined} actions={<Button asChild variant="outline"><Link to={`/today?date=${date}`}>View day</Link></Button>} />
    <PageBody width="form"><DayReview key={date} date={date} forceCloseBanner={forceCloseBanner} /></PageBody>
  </Page>;
}
