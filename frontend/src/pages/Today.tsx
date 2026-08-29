import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Plus } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api, type Task as APITask } from '@/lib/api';
import { Button } from '@/components/ui/button';

function TaskCard({ task, onToggle, isLeftover }: { task: APITask; onToggle: (id: string) => void; isLeftover?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <motion.div layout ref={setNodeRef} style={style} {...attributes}
      className="group flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:bg-accent transition-colors relative"
    >
      {isLeftover && (
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-amber-500" />
      )}

      <button onClick={() => onToggle(task.id)}
        className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ 
          borderColor: task.completed ? 'hsl(var(--primary))' : 'hsl(var(--border))', 
          backgroundColor: task.completed ? 'hsl(var(--primary))' : 'transparent' 
        }}
      >
        {task.completed && <span className="text-[10px] text-primary-foreground">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {task.title}
        </p>
        {task.duration && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">~{task.duration} min</span>
          </div>
        )}
      </div>

      {isLeftover && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
          from yesterday
        </span>
      )}

      <div {...listeners} className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
        <GripVertical size={14} />
      </div>
    </motion.div>
  );
}


export default function Today() {
  const [todayTasks, setTodayTasks] = useState<APITask[]>([]);
  const [leftovers, setLeftovers] = useState<APITask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor));
  const now = new Date();

  useEffect(() => {
    Promise.all([
      api.getTodayTasks(),
      api.getLeftovers(),
    ])
      .then(([todayData, leftoverData]) => {
        setTodayTasks(todayData.tasks || []);
        setLeftovers(leftoverData.leftovers || []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleToggle = async (taskId: string) => {
    try {
      await api.toggleTask(taskId);
      // Update local state
      setTodayTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
      );
      setLeftovers((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t))
      );
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setTodayTasks((tasks) => {
        const oldIndex = tasks.findIndex((t) => t.id === active.id);
        const newIndex = tasks.findIndex((t) => t.id === over.id);
        return arrayMove(tasks, oldIndex, newIndex);
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Loading your day...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-foreground">
            Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Today Section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
              Today
            </h2>
            <Button variant="ghost" size="sm">
              <Plus className="mr-1 h-4 w-4" />
              Add task
            </Button>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={todayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {todayTasks.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/50 px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">No tasks for today yet</p>
                  </div>
                ) : (
                  todayTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onToggle={handleToggle} />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Leftovers Section */}
        {leftovers.length > 0 && (
          <div>
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Leftovers from yesterday
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Check these off or they'll be removed tonight
              </p>
            </div>
            <div className="space-y-2">
              {leftovers.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={handleToggle} isLeftover />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
