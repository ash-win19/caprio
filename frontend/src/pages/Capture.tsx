import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Inbox, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategories, useCreateTask, useDeleteTask, useInboxTasks, useUpdateTask, useWorkflow } from '@/lib/queries';
import { localDate } from '@/lib/date';
import type { Urgency } from '@/lib/types';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { followingDate } from '@/components/workflow/dates';

export default function Capture() {
  const inbox = useInboxTasks();
  const categories = useCategories();
  const workflow = useWorkflow();
  const create = useCreateTask();
  const remove = useDeleteTask();
  const promote = useUpdateTask();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [duration, setDuration] = useState('30');
  const [urgency, setUrgency] = useState<Urgency>('medium');
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const tasks = inbox.data || [];
  const visible = filter ? tasks.filter((task) => task.categoryId === filter) : tasks;
  const targetDate = workflow.data?.state === 'closed' ? followingDate(localDate()) : localDate();
  const targetLabel = workflow.data?.state === 'closed' ? 'tomorrow' : 'today';

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || create.isPending) return;
    setNotice('');
    create.mutate({ title: title.trim(), categoryId: categoryId || undefined, duration: Number(duration), urgency, sortOrder: tasks.length, status: 'backlog', plannedForDate: localDate() }, {
      onSuccess: () => { setTitle(''); setShowForm(false); setNotice('Task saved to your inbox.'); },
    });
  };

  return <div className="mx-auto max-w-3xl">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-medium">Inbox</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Keep tasks here until you’re ready to plan them.</p></div><Button onClick={() => { create.reset(); setShowForm(true); }}><Plus size={16} className="mr-2" />Add task</Button></header>
    <div role="status" aria-live="polite" className={notice ? 'mb-4 text-sm text-primary' : 'sr-only'}>{notice}</div>
    {showForm && <form onSubmit={handleAdd} className="mb-6 space-y-4 rounded-xl border border-border bg-card p-5">
      <div><label htmlFor="inbox-title" className="mb-2 block text-xs text-muted-foreground">Task</label><Input id="inbox-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What do you need to do?" maxLength={500} required autoFocus /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label htmlFor="inbox-category" className="mb-2 block text-xs text-muted-foreground">Category</label><select id="inbox-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="">Uncategorized</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
        <div><label htmlFor="inbox-duration" className="mb-2 block text-xs text-muted-foreground">Minutes</label><Input id="inbox-duration" type="number" min={1} max={1440} step={1} required value={duration} onChange={(event) => setDuration(event.target.value)} /></div>
        <div><label htmlFor="inbox-urgency" className="mb-2 block text-xs text-muted-foreground">Urgency</label><select id="inbox-urgency" value={urgency} onChange={(event) => setUrgency(event.target.value as Urgency)} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      </div>
      {create.error && <WorkflowError error={create.error} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={create.isPending || !title.trim()}>{create.isPending ? 'Saving…' : 'Save to inbox'}</Button></div>
    </form>}
    {!!tasks.length && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs text-muted-foreground">Category<select aria-label="Filter inbox by category" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-md border border-border bg-card px-3 py-2 text-sm"><option value="">All categories</option>{categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><Link to={`/new?date=${targetDate}`} className="text-sm text-primary hover:underline">Plan with my inbox →</Link></div>}
    {(remove.error || promote.error) && <div className="mb-4"><WorkflowError error={remove.error || promote.error} /></div>}
    {inbox.isLoading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading your inbox…</p> : inbox.error ? <WorkflowError error={inbox.error} retry={() => void inbox.refetch()} /> : !visible.length ? <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center"><Inbox className="mx-auto mb-4 h-8 w-8 text-muted-foreground" /><h2 className="text-lg font-medium">{filter ? 'No tasks in this category' : 'A place for what comes next'}</h2><p className="mt-2 text-sm text-muted-foreground">{filter ? 'Choose another category or add a task.' : 'Add a task now. Decide when it belongs in your day later.'}</p></div> : <div className="space-y-2">{visible.map((task) => <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="min-w-0 flex-1"><h2 className="text-sm font-medium">{task.title}</h2><p className="mt-1.5 text-xs text-muted-foreground">{task.category}{task.duration ? ` · ${task.duration} min` : ''} · {task.urgency} urgency</p>{task.priorityReason && <p className="mt-2 text-xs leading-5 text-muted-foreground">{task.priorityReason}</p>}</div>
      <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={promote.isPending || remove.isPending || !workflow.data} onClick={() => { remove.reset(); setNotice(''); promote.mutate({ id: task.id, updates: { status: 'planned', plannedForDate: targetDate } }, { onSuccess: () => setNotice(`${task.title} added to ${targetLabel}’s plan.`) }); }}>Add to {targetLabel}<ArrowRight size={13} className="ml-2" /></Button><Button size="icon" variant="ghost" aria-label={`Delete ${task.title}`} disabled={remove.isPending || promote.isPending} onClick={() => { promote.reset(); setNotice(''); remove.mutate(task.id, { onSuccess: () => setNotice('Task removed from your inbox.') }); }}><Trash2 size={15} /></Button></div>
    </article>)}</div>}
    <p className="mt-6 text-xs leading-5 text-muted-foreground">Adding a task to {targetLabel} saves your choice immediately. Use the planner if you want help fitting it around your other work.</p>
    {workflow.error && <div className="mt-3"><WorkflowError error={workflow.error} retry={() => void workflow.refetch()} /></div>}
  </div>;
}
