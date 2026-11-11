import { Link } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ChevronDown, Plus } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCreateTask, useLaterTasks, useTasks, useToggleTask, useReorderTasks, useUpdateTask, useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import { useNavigationLock } from '@/lib/dateDrafts';
import { daysCarried } from '@/lib/carried';
import { isConfirmed } from '@/lib/dayEntry';
import { laterLabel, nextDate, weekday } from '@/lib/date';
import { formatMinutes } from '@/lib/duration';
import { Button } from '@/components/ui/button';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/hooks/use-toast';
import { Page } from '@/components/PageLayout';
import { LaterTaskRow, TodayTaskRow } from '@/components/TodayTaskRow';
import { WrapUpSheet } from '@/components/WrapUpSheet';
import { planChangeCount } from '@/components/workflow/PlanCard';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import type { Task } from '@/lib/types';

const EMPTY_TASKS: Task[] = [];

// How a wrapped-up Day ended, in one line.
function wrappedLine(carried: number, to: string) {
  if (carried === 0) return 'Wrapped up · nothing carries over';
  return `Wrapped up · ${carried} ${carried === 1 ? 'task carries' : 'tasks carry'} to ${weekday(to)}`;
}

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
  const update = useUpdateTask();
  const laterQuery = useLaterTasks(date);
  const later = laterQuery.data ?? EMPTY_TASKS;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const active = tasks.filter(task => !task.completed);
  const completed = tasks.filter(task => task.completed);
  const workflow = workflowQuery.data;
  // A wrapped-up Day keeps its finished work as it was; new work continues it.
  const wrappedUp = workflow?.state === 'closed';
  const remainingMinutes = active.reduce((sum, task) => sum + (task.duration || 0), 0);
  const busy = reorder.isPending || toggle.isPending || update.isPending;
  const rowsReadOnly = wrappedUp || busy;
  const [wrappingUp, setWrappingUp] = useState(false);
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
  const draftChanges = workflow?.plan ? planChangeCount(workflow.plan) : 0;
  const unplanned = Boolean(workflow) && !isConfirmed(workflow);
  const loadError = tasksQuery.error || workflowQuery.error;
  const saveError = create.error || reorder.error || toggle.error || update.error;
  // Moves save at once, like every edit made on the list. Later is undated;
  // today is planned for the current Day. The backend places the task last.
  const moveToLater = (task: Task) => update.mutate({ id: task.id, updates: { status: 'backlog' } });
  const moveToToday = (task: Task) => update.mutate({ id: task.id, updates: { status: 'planned', plannedForDate: date } });
  // Drop is quick and reversible: Undo gives the task back the status it had.
  // A wrapped-up Day's record is settled, so nothing is dropped onto it.
  const dropTask = (task: Task) => update.mutate({ id: task.id, updates: { status: 'dropped' } }, {
    onSuccess: () => {
      const dropped = toast({
        title: 'Dropped',
        description: task.title,
        action: <ToastAction altText={`Undo dropping ${task.title}`} onClick={() => { dropped.dismiss(); update.mutate({ id: task.id, updates: { status: task.status } }); }}>Undo</ToastAction>,
      });
    },
  });

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
      <form className="today-quick-add" onSubmit={addTask}>
        <Plus size={18} aria-hidden />
        <input ref={quickAdd} value={newTitle} onChange={event => setNewTitle(event.target.value)} aria-label="Add a task to today" placeholder="Add a task" maxLength={500} autoComplete="off" enterKeyHint="done" />
        <span className="today-quick-add-hint" aria-hidden>saves now</span>
      </form>
      {saveError && <WorkflowError error={saveError} />}
      {active.length > 0 ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={active.map(task => task.id)} strategy={verticalListSortingStrategy}>
          <ol aria-label="Remaining tasks" className="today-task-list">{active.map((task, index) => <TodayTaskRow key={task.id} task={task} carriedDays={daysCarried(task, workflow?.carryoverOrigins?.[task.id], date)} readOnly={rowsReadOnly} sortable={!wrappedUp} onToggle={toggleTask} canMoveUp={index > 0} canMoveDown={index < active.length - 1} onMove={direction => moveTask(index, index + direction, 'actions')} onMoveToLater={() => moveToLater(task)} onDrop={() => dropTask(task)} />)}</ol>
        </SortableContext>
      </DndContext> : <p className="list-empty">{tasks.length ? 'Nothing left for today.' : 'Nothing on today’s list yet.'}</p>}
      <details className="today-later">
        <summary><ChevronDown size={16} aria-hidden /><span>Later{laterQuery.isSuccess && ` · ${later.length}`}</span><span className="today-later-hint">No date, or a future day</span></summary>
        {laterQuery.error ? <WorkflowError error={laterQuery.error} retry={() => { void laterQuery.refetch(); }} />
          : !laterQuery.isSuccess ? <p role="status" className="list-empty">Loading…</p>
          : later.length > 0 ? <ol aria-label="Later tasks" className="today-task-list mt-3">{later.map(task => <LaterTaskRow key={task.id} task={task} when={task.status === 'planned' && task.plannedForDate ? laterLabel(task.plannedForDate, date) : undefined} disabled={busy} onMoveToToday={() => moveToToday(task)} onDrop={wrappedUp ? undefined : () => dropTask(task)} />)}</ol>
          : <p className="list-empty">Nothing waiting.</p>}
      </details>
      {completed.length > 0 && <details key={date} className="today-done">
        <summary id="today-done-toggle"><ChevronDown size={16} aria-hidden /><span>Done · {completed.length}</span></summary>
        <ol aria-label="Done tasks" className="today-task-list mt-3">{completed.map(task => <TodayTaskRow key={task.id} task={task} readOnly={rowsReadOnly} onToggle={toggleTask} />)}</ol>
      </details>}
      {/* Wrapping up discards a waiting Draft, so the Draft is settled first. */}
      {workflow?.state === 'active' && !workflow.plan && <section aria-label="Wrap up" className="today-wrap-up">
        <p><strong>Done for the day?</strong> Wrap up is optional. Unchecked tasks carry over on their own.</p>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setWrappingUp(true)}>Wrap up</Button>
      </section>}
      {wrappedUp && <p className="today-wrapped">{wrappedLine(workflow.review?.carriedToTomorrowCount ?? 0, workflow.review?.carriedToDate || nextDate(date))}</p>}
      <WrapUpSheet open={wrappingUp} onOpenChange={setWrappingUp} date={date} tasks={tasks} />
    </section>}
    <div className="today-message-bar">
      <Link to="/conversation">{unplanned ? 'Plan your day with Caprio…' : 'Tell Caprio what changed…'}<span aria-hidden><ArrowUp size={15} /></span></Link>
    </div>
  </Page>;
}
