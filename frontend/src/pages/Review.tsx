import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useWorkflow } from '@/lib/queries';
import { localDate } from '@/lib/date';
import * as api from '@/lib/api';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel, selectedDate } from '@/components/workflow/dates';

type TaskAction = 'done' | 'tomorrow' | 'drop';
const ENERGY = ['Drained', 'Low', 'Steady', 'High', 'Energized'];
const OUTCOMES = [{ action: 'done', label: 'Done', icon: Check }, { action: 'tomorrow', label: 'Tomorrow', icon: ArrowRight }, { action: 'drop', label: 'Drop', icon: X }] as const;

function DayReview({ date }: { date: string }) {
  const workflowQuery = useWorkflow(date);
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [actions, setActions] = useState<Record<string, TaskAction>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const workflow = workflowQuery.data;
  const tasks = workflow?.tasks || [];
  const actionFor = (task: api.BackendTask) => task.completed ? 'done' : actions[task.id];
  const allMarked = tasks.every((task) => actionFor(task));
  const close = useMutation({
    mutationFn: () => api.closeDay({ date, taskActions: tasks.map((task) => ({ taskId: task.id, action: actionFor(task)! })), notes: notes.trim() || undefined, energyLevel: energy ?? undefined }),
    onSuccess: async () => {
      setSaved(true);
      await Promise.all(['workflow', 'tasks', 'inbox', 'bootstrap', 'chat-sessions'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    },
    onError: () => { void workflowQuery.refetch(); },
  });

  if (workflowQuery.isLoading) return <p role="status" className="py-12 text-sm text-muted-foreground">Loading your day…</p>;
  if (workflowQuery.error) return <WorkflowError error={workflowQuery.error} retry={() => void workflowQuery.refetch()} />;
  if (!workflow) return null;
  if (workflow.state === 'closed') return <DaySummary workflow={workflow} />;
  if (date !== localDate()) return <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-medium">{date > localDate() ? 'This day hasn’t started yet' : 'This day is in your history'}</h2><p className="mt-2 text-sm text-muted-foreground">You can review and close the current day. Saved days remain available in your history.</p><Button asChild className="mt-5"><Link to="/review">Review today</Link></Button></section>;
  if (saved) return <div role="status" className="rounded-xl border border-border p-6"><h2 className="text-xl font-medium">Your review is saved</h2><p className="mt-2 text-sm text-muted-foreground">Loading your day summary…</p><Button variant="outline" className="mt-4" onClick={() => void workflowQuery.refetch()}>Load summary</Button></div>;
  if (workflow.state !== 'active') return <section className="rounded-2xl border border-border bg-card p-6"><h2 className="text-lg font-medium">Start with a daily plan</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Once your plan is confirmed, come here to save what you finished and what should move forward.</p><Button asChild className="mt-5"><Link to={`/new?date=${date}`}>Plan this day</Link></Button></section>;

  return <>
    <div className="mb-5 flex items-center justify-between gap-4"><p className="text-sm text-muted-foreground">{step === 0 ? 'Choose what happens to each task.' : 'A little context for tomorrow.'}</p><span className="text-xs text-muted-foreground">{step + 1} of 2</span></div>
    {step === 0 ? <>
      <div className="space-y-3">{tasks.map((task) => <fieldset key={task.id} className="rounded-xl border border-border bg-card p-4"><legend className="sr-only">Outcome for {task.title}</legend><p className="mb-3 text-sm font-medium">{task.title}</p><div className="flex flex-wrap gap-2">{OUTCOMES.map(({ action, label, icon: Icon }) => <button key={action} type="button" aria-pressed={actionFor(task) === action} disabled={task.completed && action !== 'done'} aria-label={`${label}: ${task.title}`} onClick={() => setActions((previous) => ({ ...previous, [task.id]: action }))} className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${actionFor(task) === action ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}><Icon size={13} />{label}</button>)}</div></fieldset>)}</div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">Tomorrow moves the task to the next day. Drop removes it from your plan. Your choices save together when you close the day.</p>
      <Button onClick={() => setStep(1)} disabled={!allMarked} className="mt-6">Continue<ArrowRight className="ml-2 h-4 w-4" /></Button>
    </> : <div className="space-y-6">
      <div><label htmlFor="review-notes" className="mb-2 block text-sm font-medium">Notes for tomorrow <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea id="review-notes" value={notes} maxLength={8000} onChange={(event) => setNotes(event.target.value)} placeholder="What helped, what got in the way, or what should you remember?" className="min-h-[120px] bg-card" /><p className="mt-2 text-xs text-muted-foreground">These notes are saved with your review.</p></div>
      <fieldset><legend className="mb-3 text-sm font-medium">How was your energy? <span className="font-normal text-muted-foreground">(optional)</span></legend><div className="flex flex-wrap gap-2">{ENERGY.map((label, index) => <button key={label} type="button" aria-pressed={energy === index + 1} onClick={() => setEnergy(energy === index + 1 ? null : index + 1)} className={`rounded-lg border px-3 py-2.5 text-xs ${energy === index + 1 ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>{label}</button>)}</div></fieldset>
      <div className="rounded-xl bg-muted p-4 text-sm leading-6">{tasks.filter((task) => actionFor(task) === 'done').length} completed · {tasks.filter((task) => actionFor(task) === 'tomorrow').length} moving to tomorrow · {tasks.filter((task) => actionFor(task) === 'drop').length} dropped</div>
      <p className="text-xs leading-5 text-muted-foreground">Closing saves your outcomes and finishes this day. You can return to the summary anytime.</p>
      {close.error && <WorkflowError error={close.error} />}
      <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => setStep(0)} disabled={close.isPending}><ArrowLeft size={15} className="mr-2" />Back</Button><Button onClick={() => close.mutate()} disabled={close.isPending || !allMarked}>{close.isPending ? 'Saving review…' : 'Close day'}</Button></div>
    </div>}
  </>;
}

export default function Review() {
  const [params] = useSearchParams();
  const date = selectedDate(params.get('date'), localDate());
  return <div className="mx-auto max-w-2xl"><header className="mb-7"><h1 className="text-2xl font-medium">Review your day</h1><p className="mt-2 text-sm text-muted-foreground">{dateLabel(date)}</p></header><DayReview key={date} date={date} /></div>;
}
