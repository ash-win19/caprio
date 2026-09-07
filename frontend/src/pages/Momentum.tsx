import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { useChatSessions } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';

export default function Momentum() {
  const history = useChatSessions();
  return <div className="mx-auto max-w-3xl">
    <header className="mb-7"><h1 className="text-2xl font-medium">History</h1><p className="mt-2 text-sm text-muted-foreground">Return to your conversations, plans, and saved reviews.</p></header>
    {history.isLoading ? <p role="status" className="py-12 text-sm text-muted-foreground">Loading your history…</p> : history.error ? <WorkflowError error={history.error} retry={() => void history.refetch()} /> : !history.data?.length ? <section className="rounded-2xl border border-dashed border-border p-12 text-center"><CalendarDays className="mx-auto mb-4 h-8 w-8 text-muted-foreground" /><h2 className="text-lg font-medium">Your days will appear here</h2><p className="mt-2 text-sm text-muted-foreground">Start a conversation to build your first daily plan.</p><Button asChild className="mt-5"><Link to="/new">Plan my day</Link></Button></section> : <div className="space-y-3">{history.data.map((day) => <article key={day.sessionDate} className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{dateLabel(day.sessionDate)}</p><h2 className="mt-2 text-base font-medium">{day.title}</h2><p className="mt-1 text-xs text-muted-foreground">{day.messageCount} {day.messageCount === 1 ? 'message' : 'messages'}</p><div className="mt-4 flex flex-wrap gap-5"><Link to={`/new?date=${day.sessionDate}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">Conversation<ArrowRight size={13} /></Link><Link to={`/today?date=${day.sessionDate}`} className="text-sm text-muted-foreground hover:text-foreground">Plan and review</Link></div></article>)}</div>}
  </div>;
}
