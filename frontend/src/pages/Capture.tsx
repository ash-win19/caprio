import { useDateDraft, useNavigationLock } from '@/lib/dateDrafts';
import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Inbox, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { useCategories, useCreateTask, useDeleteTask, useInboxTasks, useUpdateTask, useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import type { Task, Urgency } from '@/lib/types';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { followingDate } from '@/components/workflow/dates';

export default function Capture() {
  const inbox = useInboxTasks();
  const categories = useCategories();
  const workflow = useWorkflow();
  const today = useLocalDay();
  const create = useCreateTask();
  const remove = useDeleteTask();
  const promote = useUpdateTask();
  const [draft, setDraft] = useDateDraft('inbox-capture', 'account', { title: '', categoryId: '', duration: '', urgency: 'medium' as Urgency });
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const lastDeleteId = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = create.isPending || remove.isPending || promote.isPending;
  const focusCapture = useRef(false);
  useLayoutEffect(() => {
    if (!busy && focusCapture.current) { inputRef.current?.focus(); focusCapture.current = false; }
  }, [busy, notice, create.error, promote.error]);
  useNavigationLock(busy, Boolean(draft.title.trim()));
  const tasks = inbox.data || [];
  const visible = filter ? tasks.filter(task => task.categoryId === filter) : tasks;
  const targetDate = workflow.data?.state === 'closed' ? followingDate(today) : today;
  const targetLabel = workflow.data?.state === 'closed' ? 'tomorrow' : 'today';

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || busy || inbox.isLoading) return;
    setNotice(''); focusCapture.current = true;
    create.mutate({ title: draft.title.trim(), categoryId: draft.categoryId || undefined, duration: draft.duration ? Number(draft.duration) : undefined, urgency: draft.urgency, sortOrder: tasks.length, status: 'backlog', plannedForDate: today }, {
      onSuccess: () => { setDraft(previous => ({ ...previous, title: '' })); setNotice('Task saved to your inbox.'); inputRef.current?.focus(); },
    });
  };
  const discussHref = (task: Task) => `/new?date=${targetDate}&intent=interrupt&taskId=${encodeURIComponent(task.id)}&seed=${encodeURIComponent(`Consider adding to ${targetLabel}: ${task.title}`)}`;

  return <Page className="[overflow-wrap:anywhere]">
    <PageHeader title="Inbox"><p className="text-sm text-muted-foreground">Save a task now. Decide when to do it later.</p></PageHeader>
    <PageBody width="list" className="[&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11">
      <form aria-label="Add an inbox task" onSubmit={handleAdd} className="mb-6 rounded-xl border border-border bg-card p-4">
        <fieldset disabled={busy} className="min-w-0">
          <label htmlFor="inbox-title" className="mb-2 block text-sm font-medium">What do you need to do?</label>
          <div className="flex flex-wrap gap-2"><Input ref={inputRef} id="inbox-title" value={draft.title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} placeholder="Add a task…" maxLength={500} required className="h-11 min-w-0 flex-[1_1_15rem]" /><Button type="submit" className="h-11" disabled={busy || inbox.isLoading || !draft.title.trim()}><Plus size={16} className="mr-2" />{create.isPending ? 'Saving…' : 'Add task'}</Button></div>
          <details className="workspace-details mt-2"><summary>Task details <span className="font-normal text-muted-foreground">{[draft.categoryId && categories.data?.find(category => category.id === draft.categoryId)?.name, draft.duration && `${draft.duration} min`, draft.urgency !== 'medium' && `${draft.urgency} urgency`].filter(Boolean).join(' · ') || '(optional)'}</span><ChevronDown size={14} aria-hidden /></summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><label htmlFor="inbox-category" className="mb-2 block text-xs text-muted-foreground">Category</label><select id="inbox-category" value={draft.categoryId} onChange={event => setDraft(previous => ({ ...previous, categoryId: event.target.value }))} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="">Uncategorized</option>{categories.data?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
              <div><label htmlFor="inbox-duration" className="mb-2 block text-xs text-muted-foreground">Estimated minutes</label><Input id="inbox-duration" type="number" min={1} max={1440} step={1} value={draft.duration} onChange={event => setDraft(previous => ({ ...previous, duration: event.target.value }))} className="h-11" /></div>
              <div><label htmlFor="inbox-urgency" className="mb-2 block text-xs text-muted-foreground">Urgency</label><select id="inbox-urgency" value={draft.urgency} onChange={event => setDraft(previous => ({ ...previous, urgency: event.target.value as Urgency }))} className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
            </div>
          </details>
        </fieldset>
        {create.error && <div className="mt-3"><WorkflowError error={create.error} /></div>}
      </form>
      <div role="status" aria-live="polite" className={notice ? 'mb-4 text-sm text-primary' : 'sr-only'}>{notice}</div>
      {!!tasks.length && <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Unplanned tasks <span className="text-sm font-normal text-muted-foreground">{visible.length}</span></h2>{(categories.data?.length ?? 0) > 1 && <select aria-label="Filter inbox by category" value={filter} onChange={event => setFilter(event.target.value)} className="h-11 rounded-md border border-border bg-card px-3 text-sm"><option value="">All categories</option>{categories.data?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>}</div>}
      {promote.error && <div className="mb-4"><WorkflowError error={promote.error} /></div>}
      {inbox.isLoading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading your inbox…</p> : inbox.error ? <WorkflowError error={inbox.error} retry={() => void inbox.refetch()} /> : !visible.length ? <section className="py-10 text-center"><Inbox className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><h2 className="text-lg font-medium">{filter ? 'No tasks in this category' : 'Your inbox is clear'}</h2><p className="mt-2 text-sm text-muted-foreground">{filter ? 'Choose another category or add a task.' : 'Add anything you want to come back to.'}</p></section> : <ul aria-label="Inbox tasks" className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">{visible.map(task => <li key={task.id} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-[1_1_15rem]"><h3 className="break-words text-base font-medium">{task.title}</h3><p className="mt-1 text-xs text-muted-foreground">{task.category}{task.duration ? ` · ${task.duration} min` : ''}{task.urgency === 'high' ? ' · High urgency' : ''}</p>{task.priorityReason && <details className="workspace-details workspace-details-compact mt-1"><summary>Plan note<ChevronDown size={13} aria-hidden /></summary><p className="mt-1 text-sm leading-6 text-muted-foreground">{task.priorityReason}</p></details>}</div>
        <div className="flex max-w-full flex-wrap items-center gap-1">
          <Button variant="outline" className="h-11" disabled={busy || !workflow.data} onClick={() => { setNotice(''); focusCapture.current = true; promote.mutate({ id: task.id, updates: { status: 'planned', plannedForDate: targetDate } }, { onSuccess: () => { setNotice(`${task.title} added to ${targetLabel}'s plan.`); inputRef.current?.focus(); } }); }}>Add to {targetLabel}<ArrowRight size={14} className="ml-2" /></Button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button id={`inbox-actions-${task.id}`} size="icon" variant="ghost" className="h-11 w-11" disabled={busy} aria-label={`More options for ${task.title}`}><MoreHorizontal size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link to={discussHref(task)}>Discuss in Plan</Link></DropdownMenuItem><DropdownMenuItem onSelect={() => { remove.reset(); lastDeleteId.current = task.id; setDeleteTarget(task); }}><Trash2 size={14} className="mr-2" />Delete task</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </li>)}</ul>}
      {!!tasks.length && <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Add to {targetLabel} saves immediately.</p><Link to={`/new?date=${targetDate}`} className="inline-flex min-h-11 items-center gap-2 text-sm underline underline-offset-4">Plan with my inbox<ArrowRight size={14} /></Link></div>}
      {workflow.error && <div className="mt-3"><WorkflowError error={workflow.error} retry={() => void workflow.refetch()} /></div>}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !remove.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); (document.getElementById(`inbox-actions-${lastDeleteId.current}`) || inputRef.current)?.focus(); }}>
          <AlertDialogHeader><AlertDialogTitle>Delete this task?</AlertDialogTitle><AlertDialogDescription className="break-words">{deleteTarget?.title} will be removed from your inbox. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          {remove.error && <WorkflowError error={remove.error} />}
          <AlertDialogFooter><AlertDialogCancel disabled={remove.isPending}>Keep task</AlertDialogCancel><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleteTarget) remove.mutate(deleteTarget.id, { onSuccess: () => { focusCapture.current = true; setDeleteTarget(null); setNotice('Task removed from your inbox.'); } }); }}>{remove.isPending ? 'Deleting…' : 'Delete task'}</Button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  </Page>;
}
