import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategories, invalidatePlanningQueries } from '@/lib/queries';
import { useDateDraft, useNavigationLock } from '@/lib/dateDrafts';
import type { Category } from '@/lib/types';
import { updateSettings } from '@/lib/api';
import { WorkflowError } from '@/components/workflow/WorkflowUI';

const SWATCH_COLORS = ['#4A7CFF', '#F97316', '#A855F7', '#EF4444', '#EAB308', '#EC4899', '#06B6D4', '#84CC16'];
const EMPTY_CATEGORIES: Category[] = [];

export default function SettingsCategories() {
  const categories = useCategories();
  const client = useQueryClient();
  const [draft, setDraft] = useDateDraft<Category[] | null>('settings-categories', 'account', null);
  const cats = draft ?? categories.data ?? EMPTY_CATEGORIES;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const focusCategory = useRef<string | null>(null);
  useNavigationLock(saving, draft !== null);
  useLayoutEffect(() => {
    if (focusCategory.current) document.getElementById(`category-${focusCategory.current}`)?.focus();
    focusCategory.current = null;
  }, [cats]);
  const change = (next: Category[]) => { setMessage(''); setError(null); setDraft(next); };
  const move = (index: number, offset: number) => {
    const next = [...cats];
    const [category] = next.splice(index, 1);
    next.splice(index + offset, 0, category);
    focusCategory.current = category.id;
    change(next);
  };
  const addCategory = () => {
    if (cats.length >= 30) return;
    const category = { id: crypto.randomUUID(), name: 'New category', color: SWATCH_COLORS[cats.length % SWATCH_COLORS.length] };
    focusCategory.current = category.id;
    change([...cats, category]);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || draft === null || cats.some(cat => !cat.name.trim())) return;
    setSaving(true); setMessage(''); setError(null);
    try {
      await updateSettings({}, cats.map(cat => ({ ...cat, name: cat.name.trim() })));
      await invalidatePlanningQueries(client);
      setDraft(null); setMessage('Categories saved.');
    } catch (error) { setError(error); }
    finally { setSaving(false); }
  };
  return <Page className="[overflow-wrap:anywhere]">
    <PageHeader title="Categories" parent={{ label: 'Settings', href: '/settings' }}><p className="text-sm text-muted-foreground">Organize your tasks. Open a category to edit it.</p></PageHeader>
    <PageBody width="form" className="[&_button]:max-w-full [&_button]:whitespace-normal [&_button]:h-auto [&_button]:min-h-11 [&_input]:max-w-full">
      {categories.isLoading ? <p role="status">Loading categories…</p> : categories.error ? <WorkflowError error={categories.error} retry={() => void categories.refetch()} /> : <form onSubmit={save}>
        <fieldset disabled={saving} className="min-w-0 space-y-3">
          {cats.map((cat, index) => <details key={cat.id} className="workspace-details rounded-xl border border-border bg-card p-4">
            <summary id={`category-${cat.id}`}><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} aria-hidden /><span className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">{cat.name || 'Unnamed category'}</span><ChevronDown size={16} aria-hidden /></summary>
            <div className="mt-4 space-y-4">
              <div><label htmlFor={`category-name-${cat.id}`} className="mb-2 block text-sm">Name</label><Input id={`category-name-${cat.id}`} required maxLength={100} value={cat.name} onChange={event => change(cats.map(item => item.id === cat.id ? { ...item, name: event.target.value } : item))} className="h-11" /></div>
              <div><label htmlFor={`category-hours-${cat.id}`} className="mb-2 block text-sm">Weekly hours <span className="text-muted-foreground">(optional)</span></label><Input id={`category-hours-${cat.id}`} type="number" min={0} max={168} step={0.5} value={cat.hoursPerWeek ?? ''} onChange={event => change(cats.map(item => item.id === cat.id ? { ...item, hoursPerWeek: event.target.value === '' ? undefined : Number(event.target.value) } : item))} className="h-11 w-28" /><p className="mt-2 text-xs leading-5 text-muted-foreground">Planning context. Set each day's available time in Plan.</p></div>
              <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-11" aria-label={`Move ${cat.name} up`} disabled={saving || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} className="mr-2" />Move up</Button><Button type="button" variant="outline" className="h-11" aria-label={`Move ${cat.name} down`} disabled={saving || index === cats.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} className="mr-2" />Move down</Button><Button type="button" variant="ghost" className="h-11 text-destructive" aria-label={`Remove ${cat.name} category`} onClick={() => { focusCategory.current = cats[index + 1]?.id ?? cats[index - 1]?.id ?? 'add'; change(cats.filter(item => item.id !== cat.id)); }}><Trash2 size={14} className="mr-2" />Remove category</Button></div>
            </div>
          </details>)}
          {!cats.length && <p className="py-4 text-sm text-muted-foreground">No categories. Tasks can still be saved as Uncategorized.</p>}
          <Button id="category-add" type="button" variant="outline" onClick={addCategory} disabled={saving || cats.length >= 30} className="h-11"><Plus size={14} className="mr-2" />Add category</Button>
        </fieldset>
        {cats.length >= 30 && <p className="mt-3 text-xs text-muted-foreground">You can have up to 30 categories.</p>}
        <p className="mt-4 text-xs text-muted-foreground">Changes apply when you save. Removing a category keeps its tasks.</p>
        {error ? <div className="mt-4"><WorkflowError error={error} /></div> : null}
        <p role="status" className={message ? 'mt-4 text-sm' : 'sr-only'}>{message}</p>
        <div className="mt-5 flex flex-wrap gap-2"><Button disabled={saving || draft === null || cats.some(cat => !cat.name.trim())} type="submit" className="h-11">{saving ? 'Saving…' : 'Save changes'}</Button>{draft !== null && <Button variant="ghost" type="button" disabled={saving} onClick={() => { setDraft(null); setMessage('Changes discarded.'); setError(null); }}>Discard changes</Button>}</div>
      </form>}
    </PageBody>
  </Page>;
}
