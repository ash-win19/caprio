import { ArrowDown, ArrowUp, ChevronDown, GripVertical, MoreHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import type { Task } from '@/lib/types';
import { STALE_DAYS } from '@/lib/carried';
import { formatMinutes } from '@/lib/duration';

export function TodayTaskRow({ task, readOnly, sortable = false, canMoveUp = false, canMoveDown = false, onToggle, onMove, carriedDays = 0 }: {
  task: Task;
  readOnly: boolean;
  sortable?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onToggle: (task: Task) => void;
  onMove?: (direction: -1 | 1) => void;
  /** Days this Carried task has rolled forward; zero when it isn't carried. */
  carriedDays?: number;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: readOnly || !sortable });
  const movedFromMenu = useRef(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const move = (direction: -1 | 1) => {
    movedFromMenu.current = true;
    onMove?.(direction);
  };
  return <li id={`today-row-${task.id}`} tabIndex={-1} ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`today-task-row ${isDragging ? 'relative z-10 shadow-lg' : ''}`}>
    <div className="today-task-line">
      <label className="today-task-check">
        <input id={`today-check-${task.id}`} type="checkbox" checked={task.completed} aria-label={`Mark ${task.title} ${task.completed ? 'incomplete' : 'complete'}`} disabled={readOnly} onChange={() => onToggle(task)} className="h-5 w-5 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card disabled:opacity-60" />
      </label>
      <div className="min-w-0 flex-1 py-2.5">
        <p className={`today-task-title ${task.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</p>
        {(task.duration != null || carriedDays > 0) && <div className="today-task-meta">
          {task.duration != null && <span>{formatMinutes(task.duration)}</span>}
          {carriedDays > 0 && <span className={carriedDays >= STALE_DAYS ? 'today-task-stale' : 'today-task-carried'}>carried · {carriedDays}d</span>}
        </div>}
        {task.description && <details className="today-task-note">
          <summary><span>Notes</span><ChevronDown size={13} aria-hidden /></summary>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{task.description}</p>
        </details>}
      </div>
      {sortable && <div className="today-task-tools">
        <button id={`today-reorder-${task.id}`} ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} disabled={readOnly} aria-label={`Reorder ${task.title}`} className="today-task-tool touch-none disabled:opacity-40"><GripVertical size={16} /></button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button ref={menuButton} id={`today-actions-${task.id}`} type="button" disabled={readOnly} aria-label={`Task actions for ${task.title}`} className="today-task-tool disabled:opacity-40"><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={event => {
            // Move focus after the menu's focus trap closes. Today then restores
            // the action button when the pending save has settled.
            if (movedFromMenu.current) {
              event.preventDefault();
              movedFromMenu.current = false;
              const target = menuButton.current?.disabled ? document.getElementById(`today-row-${task.id}`) : menuButton.current;
              target?.focus({ preventScroll: true });
            }
          }}>
            <DropdownMenuItem disabled={readOnly || !canMoveUp} onSelect={() => move(-1)}><ArrowUp size={16} className="mr-2" />Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={readOnly || !canMoveDown} onSelect={() => move(1)}><ArrowDown size={16} className="mr-2" />Move down</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
    </div>
  </li>;
}
