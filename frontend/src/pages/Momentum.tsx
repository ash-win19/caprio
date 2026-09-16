import { useState } from 'react';
import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronDown } from 'lucide-react';
import { useChatSessions } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import { dayOutcomeLine, summarizeWeek } from '@/lib/historyWeek';
import type { ChatSession } from '@/lib/api';

function WeekStrip({ sessions }: { sessions: ChatSession[] }) {
  const week = summarizeWeek(sessions);
  const counts: Array<[number, string]> = [[week.closedDays, 'Closed'], [week.done, 'Done'], [week.carried, 'Carried'], [week.dropped, 'Dropped']];
  return <section className="mb-6 border-b border-border pb-5" aria-label="Last 7 days">
    <h2 className="text-sm font-medium">Last 7 days</h2>
    {week.closedDays === 0 ? <p className="mt-2 text-sm text-muted-foreground">No closed days yet. Close a day to see its outcomes here.</p> : <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-3">{counts.map(([count, label]) => <div key={label} className="flex items-baseline gap-2"><dd className="text-lg font-medium tabular-nums">{count}</dd><dt className="text-xs text-muted-foreground">{label}</dt></div>)}</dl>}
  </section>;
}

function DayRow({ day }: { day: ChatSession }) {
  const outcomes = dayOutcomeLine(day);
  const date = dateLabel(day.sessionDate);
  return <li className="p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-medium">{date}</h3><p className="mt-1 text-sm text-muted-foreground">{day.title}</p></div><Button asChild variant="outline" className="h-11"><Link to={`/today?date=${day.sessionDate}`} aria-label={`View day for ${date}`}>View day<ArrowRight size={14} className="ml-2" /></Link></Button></div>
    <p className="mt-3 text-sm text-muted-foreground">{outcomes || (day.state === 'active' ? 'Day still open' : 'Planning in progress')}</p>
    <details className="workspace-details mt-2"><summary>Conversation<ChevronDown size={14} aria-hidden /></summary><div className="mt-2 flex flex-wrap items-center gap-4 text-sm"><span className="text-muted-foreground">{day.messageCount} {day.messageCount === 1 ? 'message' : 'messages'}</span><Link to={`/new?date=${day.sessionDate}`} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4">Open conversation<ArrowRight size={14} /></Link></div></details>
  </li>;
}

export default function Momentum() {
  const history = useChatSessions();
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const days = (history.data || []).filter(day => `${day.title} ${day.sessionDate} ${dateLabel(day.sessionDate, true)}`.toLocaleLowerCase().includes(query));
  return <Page>
    <PageHeader title="History"><p className="text-sm text-muted-foreground">Find a day and see what happened to its tasks.</p></PageHeader>
    <PageBody width="list">
      {history.isLoading ? <p role="status" className="py-12 text-sm text-muted-foreground">Loading your history…</p> : history.error ? <WorkflowError error={history.error} retry={() => void history.refetch()} /> : !history.data?.length ? <section className="py-12 text-center"><CalendarDays className="mx-auto mb-4 h-7 w-7 text-muted-foreground" /><h2 className="text-lg font-medium">Your days will appear here</h2><p className="mt-2 text-sm text-muted-foreground">Start with a daily plan. Your saved days and outcomes will appear here.</p><Button asChild className="mt-5"><Link to="/new">Plan day</Link></Button></section> : <>
        <WeekStrip sessions={history.data} />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">Saved days</h2><Input aria-label="Search history by date or title" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search date or title" className="h-11 w-full sm:w-64" /></div>
        {days.length ? <ul aria-label="Saved days" className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">{days.map(day => <DayRow key={day.sessionDate} day={day} />)}</ul> : <div role="status" className="py-8 text-center"><p className="text-sm text-muted-foreground">No days match your search.</p><Button variant="ghost" onClick={() => setSearch('')} className="mt-3">Clear search</Button></div>}
      </>}
    </PageBody>
  </Page>;
}
