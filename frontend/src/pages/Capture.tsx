import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import { CATEGORY_COLORS } from '@/lib/types';
import type { Task, Urgency } from '@/lib/types';

export default function Capture() {
  const { capturePool, addToCapturePool, removeFromCapturePool, addTaskToToday, categories } = useAppStore();
  const [filter, setFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newTask, setNewTask] = useState({ title: '', category: 'Work', urgency: 'medium' as Urgency, source: '' });

  const filtered = filter === 'All' ? capturePool : capturePool.filter((t) => t.category === filter);
  const grouped = filtered.reduce<Record<string, Task[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  const handleAdd = () => {
    if (!newTask.title.trim()) return;
    addToCapturePool({
      id: Date.now().toString(),
      title: newTask.title,
      category: newTask.category,
      urgency: newTask.urgency,
      source: newTask.source || undefined,
      completed: false,
      addedToday: true,
      carriedOver: false,
      order: capturePool.length,
    });
    setNewTask({ title: '', category: 'Work', urgency: 'medium', source: '' });
    setShowForm(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-heading text-foreground mb-1">Task pool</h1>
      <p className="text-sm text-muted-foreground mb-6">Everything you want to do, organized.</p>

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {['All', ...categories.map((c) => c.name)].map((c) => (
            <button key={c} onClick={() => setFilter(c)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap border transition-colors"
              style={{
                backgroundColor: filter === c ? `${CATEGORY_COLORS[c] || 'hsl(var(--brand))'}15` : 'hsl(var(--bg-elevated))',
                borderColor: filter === c ? `${CATEGORY_COLORS[c] || 'hsl(var(--brand))'}60` : 'hsl(var(--border))',
              }}
            >
              {c !== 'All' && <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: CATEGORY_COLORS[c] }} />}
              {c}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowForm(true)} size="sm" className="bg-primary text-primary-foreground gap-1">
          <Plus size={14} /> Add task
        </Button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="bg-accent border border-border rounded-lg p-4 mb-4 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <Input value={newTask.title} onChange={(e) => setNewTask((n) => ({ ...n, title: e.target.value }))}
                placeholder="Task title" className="flex-1 bg-card border-border" autoFocus />
              <select value={newTask.category} onChange={(e) => setNewTask((n) => ({ ...n, category: e.target.value }))}
                className="bg-card border border-border rounded-md px-3 py-2 text-sm text-foreground w-[140px]">
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {(['low', 'medium', 'high'] as Urgency[]).map((u) => (
                  <button key={u} onClick={() => setNewTask((n) => ({ ...n, urgency: u }))}
                    className={`px-3 py-1 rounded text-xs border capitalize ${
                      newTask.urgency === u ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                    style={{
                      backgroundColor: newTask.urgency === u
                        ? u === 'high' ? 'rgba(248,113,113,0.15)' : u === 'medium' ? 'rgba(251,191,36,0.15)' : 'hsl(var(--bg-elevated))'
                        : 'transparent',
                      borderColor: newTask.urgency === u
                        ? u === 'high' ? 'hsl(var(--red))' : u === 'medium' ? 'hsl(var(--amber))' : 'hsl(var(--border))'
                        : 'hsl(var(--border))',
                    }}
                  >{u}</button>
                ))}
              </div>
              <Input value={newTask.source} onChange={(e) => setNewTask((n) => ({ ...n, source: e.target.value }))}
                placeholder="Source (optional)" className="flex-1 bg-card border-border" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="bg-primary text-primary-foreground" onClick={handleAdd}>Add task</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {Object.entries(grouped).map(([cat, tasks]) => {
          const color = CATEGORY_COLORS[cat] || '#888';
          return (
            <div key={cat}>
              <button onClick={() => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }))}
                className="flex items-center gap-2 mb-2 w-full text-left">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-sm font-medium text-foreground">{cat}</span>
                <span className="text-[11px] bg-accent px-1.5 py-0.5 rounded text-muted-foreground">{tasks.length}</span>
                <ChevronDown size={14} className={`ml-auto text-muted-foreground transition-transform ${collapsed[cat] ? '-rotate-90' : ''}`} />
              </button>
              <AnimatePresence>
                {!collapsed[cat] && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    {tasks.map((task) => (
                      <div key={task.id} className="group flex items-center gap-3 py-2 px-3 rounded-md hover:bg-accent transition-colors">
                        <button onClick={() => {}} className="w-4 h-4 rounded border-2 border-border flex-shrink-0" />
                        <span className="text-sm text-foreground flex-1">{task.title}</span>
                        {task.source && <span className="text-mono text-[11px] bg-accent px-1.5 py-0.5 rounded">{task.source}</span>}
                        <span className="w-1.5 h-1.5 rounded-full" style={{
                          backgroundColor: task.urgency === 'high' ? 'hsl(var(--red))' : task.urgency === 'medium' ? 'hsl(var(--amber))' : 'hsl(var(--border))'
                        }} />
                        <div className="opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                          <button onClick={() => addTaskToToday(task)} className="text-xs text-primary hover:underline">→ Today</button>
                          <button onClick={() => removeFromCapturePool(task.id)} className="text-muted-foreground hover:text-cap-red">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
