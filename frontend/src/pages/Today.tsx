import { Link, useSearchParams } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, ListChecks } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTasks, useToggleTask, useReorderTasks, useWorkflow } from '@/lib/queries';
import { useLocalDay } from '@/lib/useLocalDay';
import { useNavigationLock } from '@/lib/dateDrafts';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/PageLayout';
import { TodayTaskRow } from '@/components/TodayTaskRow';
import { RecoveryNotice } from '@/components/workflow/RecoveryNotice';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { selectedDate } from '@/components/workflow/dates';
import type { Task } from '@/lib/types';

const EMPTY_TASKS: Task[] = [];

export default function Today() {
  const [params] = useSearchParams();
  const today = useLocalDay();
  const date = selectedDate(params.get('date'), today);
  const tasksQuery = useTasks(date);
  const workflowQuery = useWorkflow(date);
  const reorder = useReorderTasks();
  const toggle = useToggleTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const active = tasks.filter(task => !task.completed);
  const completed = tasks.filter(task => task.completed);
  const workflow = workflowQuery.data;
  const isToday = date === today;
  const readOnly = date < today || workflow?.state === 'closed';
  const dayInProgress = isToday && workflow?.state === 'active';
  const interruptHref = `/new?date=${date}&intent=interrupt`;
  const remainingMinutes = active.reduce((sum, task) => sum + (task.duration || 0), 0);
  const unestimatedCount = active.filter(task => task.duration == null).length;
  const availableMinutes = workflow?.availableMinutes ?? workflow?.proposal?.availableMinutes ?? null;
  const overCapacity = availableMinutes !== null && remainingMinutes > availableMinutes;
  const busy = reorder.isPending || toggle.isPending;
  const cardReadOnly = readOnly || !isToday || busy;
  const focusAfterTaskAction = useRef<({ id: string; date: string } & (
    { kind: 'toggle'; index: number } | { kind: 'move'; control: 'actions' | 'reorder' }
  )) | null>(null);
  useNavigationLock(busy);

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
    const target = next ? `today-${busy ? 'row' : control}-${next.id}` : 'today-completed-toggle';
    document.getElementById(target)?.focus({ preventScroll: true });
    if (!busy) focusAfterTaskAction.current = null;
  }, [tasks, busy, date]);

  const moveTask = (from: number, to: number, control: 'actions' | 'reorder') => {
    if (cardReadOnly || from === to || from < 0 || to < 0 || to >= active.length) return;
    focusAfterTaskAction.current = { kind: 'move', id: active[from].id, date, control };
    reorder.mutate([...arrayMove(active, from, to), ...completed].map((task, sortOrder) => ({ id: task.id, sortOrder })));
  };
  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (over) moveTask(active.findIndex(task => task.id === dragged.id), active.findIndex(task => task.id === over.id), 'reorder');
  };
  const toggleTask = (task: Task) => {
    if (cardReadOnly) return;
    focusAfterTaskAction.current = { kind: 'toggle', id: task.id, index: active.findIndex(item => item.id === task.id), date };
    toggle.mutate({ id: task.id, completed: !task.completed });
  };
  const allComplete = tasks.length > 0 && active.length === 0;

  return <Page className="today-page">
    <PageHeader title={isToday ? 'Today' : 'Daily plan'} date={date} status={workflow ? { planning: 'Planning', active: 'Active', closed: 'Closed' }[workflow.state] : undefined} actions={workflow && (workflow.state === 'closed'
      ? <Button asChild variant="outline"><Link to={`/review?date=${date}`}>View review</Link></Button>
      : !readOnly ? <Button asChild variant="outline"><Link to={dayInProgress ? interruptHref : `/new?date=${date}`}>{dayInProgress ? 'Adjust plan' : 'Plan day'}</Link></Button> : null)} />
    {tasksQuery.isLoading || workflowQuery.isLoading ? <p role="status" className="py-16 text-center text-sm text-muted-foreground">Loading your plan…</p> : tasksQuery.error || workflowQuery.error ? <WorkflowError error={tasksQuery.error || workflowQuery.error} retry={() => { void tasksQuery.refetch(); void workflowQuery.refetch(); }} /> : workflow?.state === 'closed' ? <DaySummary workflow={workflow} /> : <>
      <section className="today-work" aria-labelledby="today-tasks-heading">
        <div className="today-list-heading">
          <div>
            <h2 id="today-tasks-heading" className="text-2xl font-semibold tracking-tight">{isToday ? 'Your tasks' : 'Tasks for this day'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tasks.length ? `${active.length} remaining` : 'A clear place for your daily priorities.'}</p>
          </div>
          {tasks.length > 0 && <div className="today-progress">
            <p aria-live="polite" aria-atomic="true" className="text-sm tabular-nums"><span className="font-medium text-foreground">{completed.length} of {tasks.length}</span> <span className="text-muted-foreground">completed</span></p>
            <div role="progressbar" aria-label="Tasks completed" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={completed.length} aria-valuetext={`${completed.length} of ${tasks.length} tasks completed`} className="mt-2 h-1 overflow-hidden rounded-full bg-accent">
              <div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${completed.length / tasks.length * 100}%` }} />
            </div>
          </div>}
        </div>
        {tasks.length > 0 && <p className={`today-capacity ${overCapacity ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {remainingMinutes} estimated min left{unestimatedCount > 0 ? ` · ${unestimatedCount} ${unestimatedCount === 1 ? 'task' : 'tasks'} without an estimate` : ''}{availableMinutes !== null ? ` · ${availableMinutes} min planned capacity` : ''}{overCapacity ? ' · over capacity' : ''}
        </p>}
        {workflow?.proposal && <div className="today-plan-notice"><p>Plan changes are waiting for your confirmation.</p><Link to={`/new?date=${date}`}>Review proposal<ArrowRight size={14} aria-hidden /></Link></div>}
        {workflow?.state === 'planning' && tasks.length > 0 && <p className="today-plan-notice">These tasks are saved. Use Plan day to set your available time and confirm the plan.</p>}
        {(reorder.error || toggle.error) && <WorkflowError error={reorder.error || toggle.error} />}
        {!tasks.length ? <section className="today-empty">
          <ListChecks className="mb-4 h-7 w-7 text-muted-foreground" />
          <h3 className="text-xl font-medium">{readOnly ? 'No saved plan for this day' : workflow?.state === 'active' ? 'Nothing planned for this day' : 'Make room for what matters today'}</h3>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{readOnly ? 'Choose another day from your history.' : workflow?.state === 'active' ? 'Your plan is saved with no tasks. Enjoy the space, or adjust it if something comes up.' : 'Start with the tasks on your mind. Caprio will help you decide what fits and what can wait.'}</p>
          <Button asChild className="mt-5"><Link to={readOnly ? '/momentum' : dayInProgress ? interruptHref : `/new?date=${date}`}>{readOnly ? 'View history' : dayInProgress ? 'Adjust plan' : 'Plan day'}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </section> : <>
          {active.length > 0 && <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={active.map(task => task.id)} strategy={verticalListSortingStrategy}>
              <ol aria-label="Remaining tasks" className="today-task-list">{active.map((task, index) => <TodayTaskRow key={task.id} task={task} readOnly={cardReadOnly} sortable={isToday && !readOnly} onToggle={toggleTask} canMoveUp={index > 0} canMoveDown={index < active.length - 1} onMove={direction => moveTask(index, index + direction, 'actions')} />)}</ol>
            </SortableContext>
          </DndContext>}
          {completed.length > 0 && <details key={date} className="today-completed">
            <summary id="today-completed-toggle"><ChevronDown size={16} aria-hidden /><span>Completed · {completed.length}</span></summary>
            <ol aria-label="Completed tasks" className="today-task-list mt-3">{completed.map(task => <TodayTaskRow key={task.id} task={task} readOnly={cardReadOnly} onToggle={toggleTask} />)}</ol>
          </details>}
          {dayInProgress && <section aria-labelledby="review-entry-heading" className={`today-review-entry ${allComplete ? 'today-review-ready' : ''}`}>
            <div className="min-w-0">
              <h3 id="review-entry-heading" className="flex items-center gap-2 text-sm font-medium">{allComplete && <CheckCircle2 size={18} aria-hidden />}{allComplete ? 'Your tasks are complete' : 'Finished for today?'}</h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{allComplete ? 'Review your day and close it when you’re ready.' : 'Review what’s done and decide what to carry forward or drop.'}</p>
            </div>
            <Button asChild variant={allComplete ? 'default' : 'outline'} className="shrink-0"><Link to={`/review?date=${date}`}>Review day<ArrowRight size={15} className="ml-2" /></Link></Button>
          </section>}
        </>}
      </section>
    </>}
    {isToday && <RecoveryNotice />}
  </Page>;
}
