import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, GripVertical, Inbox, ListChecks } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTasks, useToggleTask, useReorderTasks, useWorkflow } from '@/lib/queries';
import { CATEGORY_COLORS, type Task } from '@/lib/types';
import { localDate } from '@/lib/date';
import { Button } from '@/components/ui/button';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel, selectedDate } from '@/components/workflow/dates';

function TaskCard({ task, readOnly, sortable = false, onToggle }: { task: Task; readOnly: boolean; sortable?: boolean; onToggle: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id, disabled: readOnly || !sortable });
  const color = CATEGORY_COLORS[task.category] || '#888888';
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rounded-xl border border-border bg-card">
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
  const date = selectedDate(params.get('date'), localDate());
  const tasksQuery = useTasks(date);
  const workflowQuery = useWorkflow(date);
  const reorder = useReorderTasks();
  const toggle = useToggleTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const tasks = tasksQuery.data || [];
  const active = tasks.filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  const workflow = workflowQuery.data;
  const readOnly = date < localDate() || workflow?.state === 'closed';
  const canComplete = date === localDate();
  const remainingMinutes = active.reduce((sum, task) => sum + (task.duration || 0), 0);

  const handleDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    if (!over || dragged.id === over.id || reorder.isPending || readOnly) return;
    const from = active.findIndex((task) => task.id === dragged.id);
    const to = active.findIndex((task) => task.id === over.id);
    if (from < 0 || to < 0) return;
    reorder.mutate([...arrayMove(active, from, to), ...completed].map((task, sortOrder) => ({ id: task.id, sortOrder })));
  };

  return <div className="mx-auto max-w-5xl">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-medium">{date === localDate() ? 'Today' : 'Your daily plan'}</h1><p className="mt-2 text-sm text-muted-foreground">{dateLabel(date)}</p></div>
      {!readOnly && <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to={`/new?date=${date}`}>{workflow?.state === 'active' ? 'Adjust plan' : 'Plan this day'}</Link></Button>{workflow?.state === 'active' && canComplete && <Button asChild><Link to={`/review?date=${date}`}>Review day</Link></Button>}</div>}
    </header>
    {tasksQuery.isLoading || workflowQuery.isLoading ? <p role="status" className="py-16 text-center text-sm text-muted-foreground">Loading your plan…</p> : tasksQuery.error || workflowQuery.error ? <WorkflowError error={tasksQuery.error || workflowQuery.error} retry={() => { void tasksQuery.refetch(); void workflowQuery.refetch(); }} /> : <>
      {workflow?.state === 'closed' ? <DaySummary workflow={workflow} /> : <>
        {workflow?.proposal && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm">A proposed plan is waiting for your confirmation.</p><Link to={`/new?date=${date}`} className="text-sm text-primary hover:underline">Review proposal →</Link></div>}
        {workflow?.state === 'planning' && tasks.length > 0 && <p className="mb-5 rounded-xl bg-muted p-4 text-sm leading-6 text-muted-foreground">These tasks are saved for this day. Plan your available time and confirm your priorities to get started.</p>}
        {!tasks.length ? <section className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
          <ListChecks className="mx-auto mb-5 h-8 w-8 text-muted-foreground" />
          <h2 className="text-xl font-medium">{readOnly ? 'No saved plan for this day' : workflow?.state === 'active' ? 'Nothing planned for this day' : 'Make room for what matters today'}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">{readOnly ? 'Choose another day from your history.' : workflow?.state === 'active' ? 'Your plan is saved with no tasks. Enjoy the space, or adjust your plan if something comes up.' : 'Start with the tasks on your mind. Caprio will help you decide what fits and what can wait.'}</p>
          <Button asChild className="mt-6"><Link to={readOnly ? '/momentum' : `/new?date=${date}`}>{readOnly ? 'View history' : workflow?.state === 'active' ? 'Adjust plan' : 'Plan my day'}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </section> : <div className="grid gap-6 lg:grid-cols-[1fr_250px]">
          <div>
            {(reorder.error || toggle.error) && <div className="mb-4"><WorkflowError error={reorder.error || toggle.error} /></div>}
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Priorities · {active.length} remaining</h2>
            {active.length ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}><SortableContext items={active.map((task) => task.id)} strategy={verticalListSortingStrategy}><div className="space-y-2">{active.map((task) => <TaskCard key={task.id} task={task} readOnly={readOnly || !canComplete || reorder.isPending || toggle.isPending} onToggle={(item) => toggle.mutate({ id: item.id, completed: !item.completed })} sortable />)}</div></SortableContext></DndContext> : <p className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm">All your planned tasks are complete. Review your day when you’re ready.</p>}
            {completed.length > 0 && <section className="mt-7"><h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Completed · {completed.length}</h2><div className="space-y-2">{completed.map((task) => <TaskCard key={task.id} task={task} readOnly={readOnly || !canComplete || toggle.isPending} onToggle={(item) => toggle.mutate({ id: item.id, completed: !item.completed })} />)}</div></section>}
          </div>
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-medium">Your day at a glance</h2><p className="mt-4 text-3xl font-medium">{completed.length}<span className="ml-2 text-base text-muted-foreground">/ {tasks.length} done</span></p><p className="mt-2 text-sm text-muted-foreground">{remainingMinutes} estimated minutes remaining</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-accent"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${completed.length / tasks.length * 100}%` }} /></div></div>
            {!readOnly && <div className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-medium">Something changed?</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Share an interruption or a new constraint. Review the suggested changes before updating your plan.</p><Link to={`/new?date=${date}`} className="mt-3 inline-block text-sm text-primary hover:underline">Adjust my plan →</Link></div>}
            <Link to="/capture" className="flex items-center justify-between rounded-xl border border-border p-4 text-sm text-muted-foreground hover:bg-accent"><span className="flex items-center gap-2"><Inbox size={16} />Open inbox</span><ArrowRight size={14} /></Link>
          </aside>
        </div>}
      </>}
    </>}
  </div>;
}
