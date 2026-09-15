import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { isValidDate, nextDate, previousDate } from '@/lib/date';
import { dateLabel } from '@/components/workflow/dates';
import { useLocalDay } from '@/lib/useLocalDay';
import { useNavigationState } from '@/lib/dateDrafts';

import { TopBarHost } from '@/lib/topbar';

function DayNavigation({ date, maxDate }: { date: string; maxDate?: string }) {
  const [, setParams] = useSearchParams();
  const today = useLocalDay();
  const locked = useNavigationState(s => s.locked);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(date);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); setPicked(date); }, [date]);
  const select = (value: string) => {
    if (locked || !isValidDate(value) || (maxDate && value > maxDate)) return;
    setOpen(false);
    // A date change must not replay an interruption seed or recovery banner.
    setParams({ date: value });
  };
  const otherYear = date.slice(0, 4) !== today.slice(0, 4);
  const label = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(otherYear ? { year: 'numeric' } : {}) });
  return <nav className="topbar-date" aria-label="Day navigation">
    <Button variant="ghost" size="icon" aria-label="Previous day" disabled={locked} onClick={() => select(previousDate(date))}><ChevronLeft size={16} /></Button>
    <Popover open={open} onOpenChange={value => { setPicked(date); setOpen(value); }}>
      <PopoverTrigger asChild><Button ref={trigger} variant="ghost" className="topbar-date-label" disabled={locked} aria-label={`Choose day, ${dateLabel(date, true)}`}><CalendarDays size={16} /><span>{label}</span></Button></PopoverTrigger>
      <PopoverContent className="w-64" align="start" onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
        <form onSubmit={event => { event.preventDefault(); select(picked); }}>
          <label htmlFor="topbar-date-picker" className="mb-2 block text-sm font-medium">Choose a day</label>
          <input id="topbar-date-picker" aria-label="Choose a day" type="date" required value={picked} max={maxDate} onChange={event => setPicked(event.target.value)} className="h-11 w-full rounded-md border border-border bg-background px-3 text-base" />
          <Button className="mt-3 w-full" disabled={locked || !isValidDate(picked) || Boolean(maxDate && picked > maxDate)}>View day</Button>
        </form>
      </PopoverContent>
    </Popover>
    <Button variant="ghost" size="icon" aria-label="Next day" disabled={locked || Boolean(maxDate && nextDate(date) > maxDate)} onClick={() => select(nextDate(date))}><ChevronRight size={16} /></Button>
    {date !== today && <Button variant="outline" size="sm" className="topbar-today" disabled={locked} onClick={() => select(today)}>Today</Button>}
  </nav>;
}

export function AppTopBar({ title, date, maxDate, actions, parent, status }: {
  title: string;
  date?: string;
  maxDate?: string;
  actions?: ReactNode;
  parent?: { label: string; href: string };
  status?: string;
}) {
  const host = useContext(TopBarHost);
  const content = <>
    <div className="topbar-page">
      {parent && <nav aria-label="Breadcrumb" className="topbar-breadcrumb"><Link to={parent.href}>{parent.label}</Link><span aria-hidden>/</span></nav>}
      <h1>{title}</h1>
      {status && <span className="topbar-status">{status}</span>}
    </div>
    {date && <DayNavigation date={date} maxDate={maxDate} />}
    {actions && <div className="topbar-actions">{actions}</div>}
  </>;
  if (host === undefined) return <header className="app-topbar">{content}</header>;
  return host ? createPortal(content, host) : null;
}
