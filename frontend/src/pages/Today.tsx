import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/lib/store';
import { useTasks, useToggleTask, useReorderTasks, useBootstrap } from '@/lib/queries';
import { CATEGORY_COLORS } from '@/lib/types';
import type { Task, TaskChange } from '@/lib/types';

function TaskCard({ task, changes }: { task: Task; changes: TaskChange[] }) {
  const change = changes.find((c) => c.taskId === task.id);
  const [showDiff, setShowDiff] = useState(!!change);
  const toggleTaskMutation = useToggleTask();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });

  const style = { transform: CSS.Transform.toString(transform), transition };
  const catColor = CATEGORY_COLORS[task.category] || '#888';

  useEffect(() => {
    if (change) {
      const t = setTimeout(() => setShowDiff(false), 8000);
      return () => clearTimeout(t);
    }
  }, [change]);

  const handleToggle = () => {
    toggleTaskMutation.mutate({ id: task.id, completed: !task.completed });
  };

  return (
    <motion.div layout ref={setNodeRef} style={style} {...attributes}
      className="group flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 hover:bg-accent transition-colors relative"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg" style={{ backgroundColor: task.completed ? 'hsl(var(--border))' : catColor }} />

      <button onClick={handleToggle}
        className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ borderColor: task.completed ? 'hsl(var(--brand))' : 'hsl(var(--border))', backgroundColor: task.completed ? 'hsl(var(--brand))' : 'transparent' }}
      >
        {task.completed && <span className="text-[10px] text-primary-foreground">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
            style={{ backgroundColor: `${catColor}14`, color: catColor }}>
            <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: catColor }} />
            {task.category}
          </span>
          {task.duration && <span className="text-mono text-[11px]">~{task.duration} min</span>}
        </div>
      </div>

      <AnimatePresence>
        {showDiff && change && (
          <motion.span
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{
              backgroundColor: change.direction === 'up' ? 'rgba(74,222,128,0.1)' : change.direction === 'down' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
              color: change.direction === 'up' ? 'hsl(var(--brand))' : change.direction === 'down' ? 'hsl(var(--red))' : 'hsl(var(--amber))',
            }}
            title={change.reason}
          >
            {change.direction === 'up' ? '↑' : change.direction === 'down' ? '↓' : 'new'}
          </motion.span>
        )}
      </AnimatePresence>

      <div {...listeners} className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
        <GripVertical size={14} />
      </div>
    </motion.div>
  );
}

function ContextPanel({ tasks }: { tasks: Task[] }) {
  const { data: bootstrapData } = useBootstrap();
  const activeCategories = [...new Set(tasks.map((t) => t.category))];
  const carriedOver = tasks.filter((t) => t.carriedOver);
  const streak = bootstrapData?.streak || 0;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-caption uppercase tracking-wider mb-3">Today at a glance</h3>
        {activeCategories.map((cat) => {
          const catTasks = tasks.filter((t) => t.category === cat);
          const done = catTasks.filter((t) => t.completed).length;
          const color = CATEGORY_COLORS[cat] || '#888';
          return (
            <div key={cat} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-foreground">{cat}</span>
                <span className="text-muted-foreground">{done} / {catTasks.length}</span>
              </div>
              <div className="h-1 bg-accent rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(done / catTasks.length) * 100}%` }}
                  className="h-full rounded-full" style={{ backgroundColor: color }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-caption uppercase tracking-wider mb-3">Carried over</h3>
        {carriedOver.length === 0 && (
          <p className="text-xs text-muted-foreground">No carried over tasks</p>
        )}
        {carriedOver.map((t) => (
          <div key={t.id} className="flex items-center gap-2 py-1.5 border-l-2 pl-3 mb-2" style={{ borderColor: 'hsl(var(--amber))' }}>
            <span className="text-xs text-foreground flex-1">{t.title}</span>
            <span className="text-mono text-[11px]">yesterday</span>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-caption uppercase tracking-wider mb-3">Current streak</h3>
        <div className="flex items-baseline gap-2">
          <span className="text-display text-primary">{streak}</span>
          <span className="text-sm text-muted-foreground">day streak</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          You've completed your daily brief {streak} days running.
        </p>
      </div>
    </div>
  );
}

export default function Today() {
  const { data: tasks = [], isLoading, error } = useTasks();
  const { data: bootstrapData } = useBootstrap();
  const reorderMutation = useReorderTasks();
  const { lastPrioritization } = useAppStore();
  const sensors = useSensors(useSensor(PointerSensor));
  const changes = lastPrioritization?.changes || [];
  const now = new Date();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      const reordered = arrayMove(tasks, oldIndex, newIndex);
      
      reorderMutation.mutate(
        reordered.map((t, i) => ({ id: t.id, sortOrder: i }))
      );
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading your tasks...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load tasks. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-medium text-foreground">Good morning, {bootstrapData?.user.name || 'there'}</h1>
          <p className="text-mono text-xs mt-1">
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-accent text-mono text-[11px]">
          AI sorted · {bootstrapData?.preferences.briefTime || '8:00 AM'}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <p className="text-caption uppercase tracking-wider mb-3">Today's priorities</p>
          {tasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No tasks for today. Start by adding some!</p>
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} changes={changes} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="w-full lg:w-[280px] flex-shrink-0">
          <ContextPanel tasks={tasks} />
        </div>
      </div>
    </div>
  );
}
