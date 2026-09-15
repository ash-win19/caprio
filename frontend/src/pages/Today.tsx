import { RecoveryNotice } from '@/components/workflow/RecoveryNotice';
import { useLocalDay } from '@/lib/useLocalDay';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, GripVertical, Inbox, ListChecks } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks, useToggleTask, useReorderTasks, useWorkflow } from '@/lib/queries';
import { CATEGORY_COLORS, type Task } from '@/lib/types';
import { useNavigationLock } from '@/lib/dateDrafts';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/PageLayout';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { selectedDate } from '@/components/workflow/dates';

function TaskCard({ task, readOnly, sortable = false, onToggle }: { task: Task; readOnly: boolean; sortable?: boolean; onToggle: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id, disabled: readOnly || !sortable });
  const color = CATEGORY_COLORS[task.category] || '#888888';
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="min-w-0 rounded-xl border border-border bg-card">
    <div className="flex items-start gap-3 px-4 py-4">
      <input type="checkbox" checked={task.completed} aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`} disabled={readOnly} onChange={() => onToggle(task)} className="mt-1 h-4 w-4 shrink-0 accent-primary disabled:opacity-60" />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${task.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />{task.category}</span>{task.duration && <span>· {task.duration} min</span>}{task.carriedOver && <span>· Carried over</span>}</div>
        {task.priorityReason && !task.completed && <p className="mt-2 text-xs leading-5 text-muted-foreground">{task.priorityReason}</p>}
      </div>
      {sortable && !readOnly && <button type="button" {...attributes} {...listeners} aria-label={`Reorder ${task.title}`} className="touch-none rounded p-1 text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary"><GripVertical size={16} /></button>}
    </div>
  </div>;
}

export default function Today() {
  const [params] = useSearchParams();
  const today = useLocalDay();
  const date = selectedDate(params.get('date'), today);
  const tasksQuery = useTasks(date);
  const workflowQuery = useWorkflow(date);
  const reorder = useReorderTasks();
  const toggle = useToggleTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const tasks = tasksQuery.data || [];
  const active = tasks.filter((task) => !task.completed);
  const carried = active.filter((task) => task.carriedOver);
  const planned = active.filter((task) => !task.carriedOver);
  const completed = tasks.filter((task) => task.completed);
  const workflow = workflowQuery.data;
  const isToday = date === today;
  const readOnly = date < today || workflow?.state === 'closed';
  const canComplete = isToday;
  const dayInProgress = isToday && workflow?.state === 'active';
  const interruptHref = `/new?date=${date}&intent=interrupt`;
  const remainingMinutes = active.reduce((sum, task) => sum + (task.duration || 0), 0);
  const availableMinutes = workflow?.availableMinutes ?? workflow?.proposal?.availableMinutes ?? null;
  const overCapacity = availableMinutes !== null && remainingMinutes > availableMinutes;
  const busy = reorder.isPending || toggle.isPending;
  useNavigationLock(busy);
  const cardReadOnly = readOnly || !canComplete || busy;

  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id || reorder.isPending || readOnly) return;
    const from = active.findIndex((task) => task.id === dragged.id);
    const to = active.findIndex((task) => task.id === over.id);
    if (from < 0 || to < 0) return;
    reorder.mutate([...arrayMove(active, from, to), ...completed].map((task, sortOrder) => ({ id: task.id, sortOrder })));
  };

  const renderCard = (task: Task) => (
    <TaskCard key={task.id} task={task} readOnly={cardReadOnly} onToggle={(item) => toggle.mutate({ id: item.id, completed: !item.completed })} sortable />
  );

  const adjustmentHref = dayInProgress ? interruptHref : `/new?date=${date}`;

  return <Page>
    <PageHeader title={isToday ? 'Today' : 'Daily plan'} date={date} status={workflow ? { planning: 'Planning', active: 'Active', closed: 'Closed' }[workflow.state] : undefined} actions={workflow && (workflow.state === 'closed'
      ? <Button asChild variant="outline"><Link to={`/review?date=${date}`}>View review</Link></Button>
      : !readOnly ? <Button asChild variant={dayInProgress ? 'default' : 'outline'}><Link to={dayInProgress ? interruptHref : `/new?date=${date}`}>{dayInProgress ? 'Adjust plan' : 'Plan day'}</Link></Button> : null)}>
      {workflow?.state !== 'closed' && tasks.length > 0 && (
        <p className={`mt-2 text-sm ${overCapacity ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
          {remainingMinutes} min remaining{availableMinutes !== null ? ` · ${availableMinutes} min available` : ''}{overCapacity ? ' · over capacity' : ''}
        </p>
      )}
    </PageHeader>
    {isToday && <RecoveryNotice />}
    {tasksQuery.isLoading || workflowQuery.isLoading ? <p role="status" className="py-16 text-center text-sm text-muted-foreground">Loading your plan…</p> : tasksQuery.error || workflowQuery.error ? <WorkflowError error={tasksQuery.error || workflowQuery.error} retry={() => { void tasksQuery.refetch(); void workflowQuery.refetch(); }} /> : <>
      {workflow?.state === 'closed' ? <DaySummary workflow={workflow} /> : <>
        {dayInProgress && tasks.length > 0 && <div className="page-notice" role="status">
          <p className="text-sm">Ready to close the day? Choose Done, Tomorrow, or Drop for each unfinished task.</p>
          <Link to={`/review?date=${date}`} className="shrink-0 text-sm font-medium text-primary hover:underline">Review day →</Link>
        </div>}
        {workflow?.proposal && <div className="page-notice">
          <p className="text-sm">A proposed plan is waiting for your confirmation.</p>
          <Link to={`/new?date=${date}`} className="shrink-0 text-sm text-primary hover:underline">Review proposal →</Link>
        </div>}
        {workflow?.state === 'planning' && tasks.length > 0 && <p className="rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">These tasks are saved for this day. Plan your available time and confirm your priorities to get started.</p>}
        {(reorder.error || toggle.error) && <WorkflowError error={reorder.error || toggle.error} />}
        {!tasks.length ? <section className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <ListChecks className="mx-auto mb-5 h-8 w-8 text-muted-foreground" />
          <h2 className="text-xl font-medium">{readOnly ? 'No saved plan for this day' : workflow?.state === 'active' ? 'Nothing planned for this day' : 'Make room for what matters today'}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{readOnly ? 'Choose another day from your history.' : workflow?.state === 'active' ? 'Your plan is saved with no tasks. Enjoy the space, or plan something if it comes up.' : 'Start with the tasks on your mind. Caprio will help you decide what fits and what can wait.'}</p>
          <Button asChild className="mt-6"><Link to={readOnly ? '/momentum' : dayInProgress ? interruptHref : `/new?date=${date}`}>{readOnly ? 'View history' : dayInProgress ? 'Something changed' : 'Plan my day'}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </section> : <div className="dashboard-grid">
          <div className="dashboard-main task-groups">
            {active.length ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={active.map((task) => task.id)} strategy={verticalListSortingStrategy}>
              {carried.length > 0 && <section className="page-section" aria-labelledby="carried-heading">
                <h2 id="carried-heading" className="section-heading">Carried over · {carried.length}</h2>
                <div className="task-stack">{carried.map(renderCard)}</div>
              </section>}
              {planned.length > 0 && <section className="page-section" aria-labelledby="priorities-heading">
                <h2 id="priorities-heading" className="section-heading">Priorities · {planned.length} remaining</h2>
                <div className="task-stack">{planned.map(renderCard)}</div>
              </section>}
            </SortableContext></DndContext> : <section className="page-section" aria-labelledby="tasks-heading">
              <h2 id="tasks-heading" className="section-heading">Tasks</h2>
              <p className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm">All your planned tasks are complete. Review your day when you’re ready.</p>
            </section>}
            {completed.length > 0 && <section className="page-section" aria-labelledby="completed-heading">
              <h2 id="completed-heading" className="section-heading">Completed · {completed.length}</h2>
              <div className="task-stack">{completed.map((task) => <TaskCard key={task.id} task={task} readOnly={cardReadOnly} onToggle={(item) => toggle.mutate({ id: item.id, completed: !item.completed })} />)}</div>
            </section>}
          </div>
          <aside className="dashboard-aside page-section" aria-labelledby="overview-heading">
            <h2 id="overview-heading" className="section-heading">Day overview</h2>
            <div className="overview-stack">
              <section className="overview-card" aria-labelledby="progress-heading">
                <h3 id="progress-heading" className="text-sm font-medium">Your day at a glance</h3>
                <p className="mt-4 text-3xl font-medium tabular-nums">{completed.length}<span className="ml-2 text-base text-muted-foreground">/ {tasks.length} done</span></p>
                <p className={`mt-2 text-sm ${overCapacity ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>
                  {remainingMinutes} estimated minutes remaining{availableMinutes !== null ? ` · ${availableMinutes} available` : ''}{overCapacity ? ' · over capacity' : ''}
                </p>
                <div role="progressbar" aria-label="Tasks completed" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={completed.length} aria-valuetext={`${completed.length} of ${tasks.length} tasks completed`} className="mt-4 h-1.5 overflow-hidden rounded-full bg-accent">
                  <div className={`h-full rounded-full transition-[width] motion-reduce:transition-none ${overCapacity ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${completed.length / tasks.length * 100}%` }} />
                </div>
              </section>
              {!readOnly && <section className="overview-card" aria-labelledby="adjust-heading">
                <h3 id="adjust-heading" className="text-sm font-medium">Something changed?</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Share an interruption or a new constraint. Review the suggested changes before updating your plan.</p>
                <Link to={adjustmentHref} className="mt-3 inline-block rounded-sm text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">{dayInProgress ? 'Something changed' : 'Adjust my plan'} →</Link>
              </section>}
              <Link to="/capture" className="overview-card group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <div className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium"><Inbox size={16} className="shrink-0" aria-hidden="true" />Open inbox</span>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Keep future tasks in one place until you’re ready to plan them.</p>
                </div>
                <ArrowRight size={16} className="text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              </Link>
            </div>
          </aside>
        </div>}
      </>}
    </>}
  </Page>;
}
