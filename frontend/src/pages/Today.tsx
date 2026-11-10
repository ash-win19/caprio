import { Link } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUp, CheckCircle2, ChevronDown, Plus } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCreateTask, useLaterTasks, useTasks, useToggleTask, useReorderTasks, useUpdateTask, useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import { useNavigationLock } from '@/lib/dateDrafts';
import { daysCarried } from '@/lib/carried';
import { isConfirmed } from '@/lib/dayEntry';
import { laterLabel } from '@/lib/date';
import { formatMinutes } from '@/lib/duration';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/PageLayout';
import { LaterTaskRow, TodayTaskRow } from '@/components/TodayTaskRow';
import { planChangeCount } from '@/components/workflow/PlanCard';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import type { Task } from '@/lib/types';

const EMPTY_TASKS: Task[] = [];

// The current Day's list: what's left, in priority order. Talking to Caprio
// happens in the Conversation, which the prompts and the message bar open.
// Past Days are in History.
export default function Today() {
  const date = useLocalDay();
  const tasksQuery = useTasks(date);
  const workflowQuery = useWorkflow(date);
  const reorder = useReorderTasks();
  const toggle = useToggleTask();
  const create = useCreateTask();
  const move = useUpdateTask();
  const laterQuery = useLaterTasks(date);
  const later = laterQuery.data ?? EMPTY_TASKS;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const active = tasks.filter(task => !task.completed);
  const completed = tasks.filter(task => task.completed);
  const workflow = workflowQuery.data;
  const editable = workflow?.state !== 'closed';
  const dayInProgress = workflow?.state === 'active';
  const remainingMinutes = active.reduce((sum, task) => sum + (task.duration || 0), 0);
  const busy = reorder.isPending || toggle.isPending || move.isPending;
  const rowsReadOnly = !editable || busy;
  const [newTitle, setNewTitle] = useState('');
  const quickAdd = useRef<HTMLInputElement>(null);
  const focusAfterTaskAction = useRef<({ id: string; date: string } & (
    { kind: 'toggle'; index: number } | { kind: 'move'; control: 'actions' | 'reorder' }
  )) | null>(null);
  useNavigationLock(busy || create.isPending);

  // Keep focus on a useful row while controls are disabled, then restore the
  // action control after the save. Completion may move the original row away.
  useLayoutEffect(() => {
    const intent = focusAfterTaskAction.current;
    if (!intent) return;
    const changed = tasks.find(task => task.id === intent.id);
    if (intent.date !== date || !changed) { focusAfterTaskAction.current = null; return; }
    const remaining = tasks.filter(task => !task.completed);
    const next = intent.kind === 'toggle' && changed.completed ? remaining[Math.min(intent.index, remaining.length - 1)] : changed;
    const control = intent.kind === 'move' ? intent.control : 'check';
    const target = next ? `today-${busy ? 'row' : control}-${next.id}` : 'today-done-toggle';
    const element = document.getElementById(target);
    const section = element?.closest('details');
    if (section && !section.open) section.open = true;
    element?.focus({ preventScroll: true });
    if (!busy) focusAfterTaskAction.current = null;
  }, [tasks, busy, date]);

  const moveTask = (from: number, to: number, control: 'actions' | 'reorder') => {
    if (rowsReadOnly || from === to || from < 0 || to < 0 || to >= active.length) return;
    focusAfterTaskAction.current = { kind: 'move', id: active[from].id, date, control };
    reorder.mutate([...arrayMove(active, from, to), ...completed].map((task, sortOrder) => ({ id: task.id, sortOrder })));
  };
  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (over) moveTask(active.findIndex(task => task.id === dragged.id), active.findIndex(task => task.id === over.id), 'reorder');
  };
  const toggleTask = (task: Task) => {
    if (rowsReadOnly) return;
    focusAfterTaskAction.current = { kind: 'toggle', id: task.id, index: active.findIndex(item => item.id === task.id), date };
    toggle.mutate({ id: task.id, completed: !task.completed });
  };
  // Quick add saves straight to the Day; only the Conversation goes through a Draft.
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || create.isPending) return;
    // Below everything on the Day: positions can skip numbers after Rollover.
    const sortOrder = Math.max(-1, ...tasks.map(task => task.order)) + 1;
    create.mutate({ title, sortOrder, status: 'planned', plannedForDate: date }, {
      onSuccess: () => { setNewTitle(''); quickAdd.current?.focus(); },
    });
  };
  const allComplete = tasks.length > 0 && active.length === 0;
  const draftChanges = workflow?.plan ? planChangeCount(workflow.plan) : 0;
  const unplanned = Boolean(workflow) && !isConfirmed(workflow);
  const loadError = tasksQuery.error || workflowQuery.error;
  const saveError = create.error || reorder.error || toggle.error || move.error;
  // Moves save at once, like every edit made on the list. Later is undated;
  // today is planned for the current Day. The backend places the task last.
  const moveToLater = (task: Task) => move.mutate({ id: task.id, updates: { status: 'backlog' } });
  const moveToToday = (task: Task) => move.mutate({ id: task.id, updates: { status: 'planned', plannedForDate: date } });

  return <Page className="today-page">
    <header className="list-head">
      <div className="min-w-0">
        <h1>Today</h1>
        <p className="list-subtitle">{dateLabel(date)}</p>
      </div>
      {tasksQuery.isSuccess && <p className="today-summary" aria-live="polite" aria-atomic="true"><strong>{active.length} left</strong>{remainingMinutes > 0 && ` · ~${formatMinutes(remainingMinutes)}`}</p>}
    </header>
    {tasksQuery.isLoading || workflowQuery.isLoading ? <p role="status" className="py-16 text-center text-sm text-muted-foreground">Loading your list…</p> : loadError ? <WorkflowError error={loadError} retry={() => { void tasksQuery.refetch(); void workflowQuery.refetch(); }} /> : <section className="today-work" aria-label="Today’s list">
      {workflow?.plan ? <div className="today-prompt today-prompt-drafted">
        <p><strong>Your plan is drafted.</strong> {draftChanges === 0 ? 'It’s' : draftChanges === 1 ? '1 change is' : `${draftChanges} changes are`} waiting for you.</p>
        <Button asChild size="sm" className="shrink-0"><Link to="/conversation">Review draft</Link></Button>
      </div> : unplanned ? <div className="today-prompt">
        <p><strong>You haven’t planned today.</strong> {active.some(task => task.carriedOver) ? 'Caprio has your carried tasks ready.' : 'Tell Caprio what’s on, or add tasks below.'}</p>
        <Button asChild size="sm" variant="outline" className="shrink-0"><Link to="/conversation">Plan with Caprio</Link></Button>
      </div> : null}
      {editable && <form className="today-quick-add" onSubmit={addTask}>
        <Plus size={18} aria-hidden />
        <input ref={quickAdd} value={newTitle} onChange={event => setNewTitle(event.target.value)} aria-label="Add a task to today" placeholder="Add a task" maxLength={500} autoComplete="off" enterKeyHint="done" />
        <span className="today-quick-add-hint" aria-hidden>saves now</span>
      </form>}
      {saveError && <WorkflowError error={saveError} />}
      {active.length > 0 ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={active.map(task => task.id)} strategy={verticalListSortingStrategy}>
          <ol aria-label="Remaining tasks" className="today-task-list">{active.map((task, index) => <TodayTaskRow key={task.id} task={task} carriedDays={daysCarried(task, workflow?.carryoverOrigins?.[task.id], date)} readOnly={rowsReadOnly} sortable={editable} onToggle={toggleTask} canMoveUp={index > 0} canMoveDown={index < active.length - 1} onMove={direction => moveTask(index, index + direction, 'actions')} onMoveToLater={() => moveToLater(task)} />)}</ol>
        </SortableContext>
      </DndContext> : <p className="list-empty">{tasks.length ? 'Nothing left for today.' : 'Nothing on today’s list yet.'}</p>}
      <details className="today-later">
        <summary><ChevronDown size={16} aria-hidden /><span>Later · {later.length}</span><span className="today-later-hint">No date, or a future day</span></summary>
        {later.length > 0 ? <ol aria-label="Later tasks" className="today-task-list mt-3">{later.map(task => <LaterTaskRow key={task.id} task={task} when={task.status === 'planned' && task.plannedForDate ? laterLabel(task.plannedForDate, date) : undefined} disabled={!editable || busy} onMoveToToday={() => moveToToday(task)} />)}</ol>
          : <p className="list-empty">Nothing waiting.</p>}
      </details>
      {completed.length > 0 && <details key={date} className="today-done">
        <summary id="today-done-toggle"><ChevronDown size={16} aria-hidden /><span>Done · {completed.length}</span></summary>
        <ol aria-label="Done tasks" className="today-task-list mt-3">{completed.map(task => <TodayTaskRow key={task.id} task={task} readOnly={rowsReadOnly} onToggle={toggleTask} />)}</ol>
      </details>}
      {dayInProgress && tasks.length > 0 && <section aria-labelledby="review-entry-heading" className={`today-review-entry ${allComplete ? 'today-review-ready' : ''}`}>
        <div className="min-w-0">
          <h2 id="review-entry-heading" className="flex items-center gap-2 text-sm font-medium">{allComplete && <CheckCircle2 size={18} aria-hidden />}{allComplete ? 'Your tasks are complete' : 'Finished for today?'}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{allComplete ? 'Review your day and close it when you’re ready.' : 'Review what’s done and decide what to carry forward or drop.'}</p>
        </div>
        <Button asChild variant={allComplete ? 'default' : 'outline'} className="shrink-0"><Link to={`/review?date=${date}`}>Review day<ArrowRight size={15} className="ml-2" /></Link></Button>
      </section>}
    </section>}
    <div className="today-message-bar">
      <Link to="/conversation">{unplanned ? 'Plan your day with Caprio…' : 'Tell Caprio what changed…'}<span aria-hidden><ArrowUp size={15} /></span></Link>
    </div>
  </Page>;
}
