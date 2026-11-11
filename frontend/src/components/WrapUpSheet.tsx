import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { invalidatePlanningQueries } from '@/lib/queries';
import { nextDate, weekday } from '@/lib/date';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import type { Task } from '@/lib/types';

// Wrap up: the optional end of a Day. Each unchecked task is kept for the
// next Day unless it is dropped, and one line can be left for tomorrow.
export function WrapUpSheet({ open, onOpenChange, date, tasks }: { open: boolean; onOpenChange: (open: boolean) => void; date: string; tasks: Task[] }) {
  const wide = useMediaQuery('(min-width: 768px)');
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side={wide ? 'right' : 'bottom'} className="wrap-up-sheet">
      {/* Mounted only while open, so choices never outlive a "Not now". */}
      <WrapUpForm date={date} tasks={tasks} onDone={() => onOpenChange(false)} />
    </SheetContent>
  </Sheet>;
}

function WrapUpForm({ date, tasks, onDone }: { date: string; tasks: Task[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState('');
  const unchecked = tasks.filter(task => !task.completed);
  const wrapUp = useMutation({
    mutationFn: () => api.closeDay({
      date,
      // Keep is the backend's "tomorrow": the task carries to the next Day.
      taskActions: tasks.map(task => ({ taskId: task.id, action: task.completed ? 'done' : dropped.has(task.id) ? 'drop' : 'tomorrow' })),
      notes: note.trim() || undefined,
    }),
    onSuccess: async () => { await invalidatePlanningQueries(queryClient); onDone(); },
    // The server refuses a list that no longer matches its own, so show the current one.
    onError: () => invalidatePlanningQueries(queryClient),
  });
  const listChanged = wrapUp.error instanceof api.ApiError && wrapUp.error.status === 400;
  const choose = (id: string, drop: boolean) => setDropped(current => {
    const next = new Set(current);
    if (drop) next.add(id); else next.delete(id);
    return next;
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!wrapUp.isPending) wrapUp.mutate();
  };

  return <form onSubmit={submit} className="wrap-up-form">
    <SheetHeader className="text-left">
      <SheetTitle>Wrap up</SheetTitle>
      <SheetDescription>{unchecked.length > 0
        ? `Unchecked tasks carry to ${weekday(nextDate(date))} unless you drop them.`
        : 'Everything on today’s list is done.'}</SheetDescription>
    </SheetHeader>
    {unchecked.length > 0 && <ul className="wrap-up-tasks">{unchecked.map(task => {
      const drop = dropped.has(task.id);
      return <li key={task.id}><div role="group" aria-labelledby={`wrap-up-${task.id}`} className="wrap-up-task">
        <span id={`wrap-up-${task.id}`} className={drop ? 'wrap-up-task-dropped' : undefined}>{task.title}</span>
        <span className="wrap-up-choice">
          {([['Keep', false], ['Drop', true]] as const).map(([label, value]) => <label key={label}>
            <input type="radio" name={`wrap-up-${task.id}`} checked={drop === value} onChange={() => choose(task.id, value)} disabled={wrapUp.isPending} />
            <span>{label}</span>
          </label>)}
        </span>
      </div></li>;
    })}</ul>}
    <input className="wrap-up-note" value={note} onChange={event => setNote(event.target.value)} aria-label="Note for tomorrow" placeholder="A note for tomorrow (optional)" maxLength={280} autoComplete="off" enterKeyHint="done" disabled={wrapUp.isPending} />
    {listChanged ? <p role="alert" className="text-sm text-destructive">Your list changed since you opened this. It’s up to date now, so check it and finish again.</p>
      : wrapUp.error && <WorkflowError error={wrapUp.error} />}
    <div className="wrap-up-actions">
      <Button type="button" variant="ghost" onClick={onDone} disabled={wrapUp.isPending}>Not now</Button>
      <Button type="submit" disabled={wrapUp.isPending}>{wrapUp.isPending ? 'Finishing…' : 'Finish'}</Button>
    </div>
  </form>;
}
