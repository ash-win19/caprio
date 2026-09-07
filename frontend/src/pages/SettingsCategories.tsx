import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppStore } from '@/lib/store';
import type { Category } from '@/lib/types';
import { updateSettings } from '@/lib/api';
import { invalidatePlanningQueries } from '@/lib/queries';

const SWATCH_COLORS = ['#4A7CFF', '#F97316', '#A855F7', '#EF4444', '#EAB308', '#EC4899', '#06B6D4', '#84CC16'];

function CategoryRow({ cat, onUpdate, onDelete }: { cat: Category; onUpdate: (c: Category) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: cat.id });
  const [editing, setEditing] = useState(false);
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} {...attributes}
      className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-3 mb-2"
    >
      <div {...listeners} className="cursor-grab text-muted-foreground"><GripVertical size={14} /></div>
      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
      {editing ? (
        <Input value={cat.name} onChange={(e) => onUpdate({ ...cat, name: e.target.value })}
          onBlur={() => setEditing(false)} autoFocus className="flex-1 h-8 bg-accent border-border" />
      ) : (
        <span className="flex-1 text-sm text-foreground cursor-pointer" onClick={() => setEditing(true)}>{cat.name}</span>
      )}
      <Input type="number" value={cat.hoursPerWeek || ''} onChange={(e) => onUpdate({ ...cat, hoursPerWeek: Number(e.target.value) })}
        className="w-12 h-8 bg-accent border-border text-center text-mono text-xs" />
      <span className="text-caption">hrs/wk</span>
      <button onClick={onDelete} className="text-muted-foreground hover:text-cap-red"><Trash2 size={14} /></button>
    </div>
  );
}

export default function SettingsCategories() {
  const { categories } = useAppStore();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [cats, setCats] = useState(categories);
  const sensors = useSensors(useSensor(PointerSensor));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      const oldIdx = cats.findIndex((c) => c.id === active.id);
      const newIdx = cats.findIndex((c) => c.id === over.id);
      setCats(arrayMove(cats, oldIdx, newIdx));
    }
  };

  const addCategory = () => {
    setCats([...cats, { id: crypto.randomUUID(), name: 'New Category', color: SWATCH_COLORS[cats.length % 8], hoursPerWeek: 0 }]);
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await updateSettings({}, cats);
      await invalidatePlanningQueries(client);
      setMessage('Categories saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save categories.');
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-[560px] mx-auto">
      <Link to="/settings" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Settings</Link>
      <h1 className="text-heading text-foreground mb-1">Life categories</h1>
      <p className="text-sm text-muted-foreground mb-6">Drag to reorder. These appear across all views.</p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={cats.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cats.map((cat) => (
            <CategoryRow key={cat.id} cat={cat}
              onUpdate={(c) => setCats(cats.map((x) => x.id === c.id ? c : x))}
              onDelete={() => setCats(cats.filter((x) => x.id !== cat.id))} />
          ))}
        </SortableContext>
      </DndContext>

      <button onClick={addCategory}
        className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground mt-2">
        <Plus size={14} /> Add category
      </button>

      <p role="status" className="text-sm mt-4">{message}</p>
      <Button disabled={saving || cats.some(cat => !cat.name.trim())} onClick={save} className="w-full mt-6 bg-primary text-primary-foreground">{saving ? 'Saving...' : 'Save changes'}</Button>
    </div>
  );
}
