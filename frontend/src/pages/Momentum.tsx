import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { useChatSessions } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel } from '@/components/workflow/dates';
import { dayOutcomeLine, summarizeWeek } from '@/lib/historyWeek';
import type { ChatSession } from '@/lib/api';

function WeekStrip({ sessions }: { sessions: ChatSession[] }) {
  const week = summarizeWeek(sessions);
  if (week.closedDays === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-border p-5" aria-label="Last 7 days">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last 7 days</p>
        <h2 className="mt-2 text-base font-medium">No closed days yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Close a day to see what you finished, carried, or dropped this week.
        </p>
      </section>
    );
  }
  const chips: Array<[number, string]> = [
    [week.closedDays, 'Closed'],
    [week.done, 'Done'],
    [week.carried, 'Carried'],
    [week.dropped, 'Dropped'],
  ];
  return (
    <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-label="Last 7 days">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last 7 days</p>
      <dl className="mt-4 flex flex-wrap gap-3">
        {chips.map(([count, label]) => (
          <div key={label} className="min-w-[4.5rem] rounded-xl border border-border bg-background px-3 py-2">
            <dd className="text-xl font-medium tabular-nums">{count}</dd>
            <dt className="mt-0.5 text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

function DayRow({ day }: { day: ChatSession }) {
  const outcomes = dayOutcomeLine(day);
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs text-muted-foreground">{dateLabel(day.sessionDate)}</p>
      <h2 className="mt-2 text-base font-medium">{day.title}</h2>
      {outcomes ? (
        <p className="mt-1 text-xs text-muted-foreground">{outcomes}</p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {day.messageCount} {day.messageCount === 1 ? 'message' : 'messages'}
          {day.state ? ` · ${day.state}` : ''}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-5">
        <Link to={`/new?date=${day.sessionDate}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
          Conversation
          <ArrowRight size={13} />
        </Link>
        <Link to={`/today?date=${day.sessionDate}`} className="text-sm text-muted-foreground hover:text-foreground">
          Plan and review
        </Link>
      </div>
    </article>
  );
}

export default function Momentum() {
  const history = useChatSessions();
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-7">
        <h1 className="text-2xl font-medium">History</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What you finished, carried, or dropped — and the conversations behind each day.
        </p>
      </header>
      {history.isLoading ? (
        <p role="status" className="py-12 text-sm text-muted-foreground">Loading your history…</p>
      ) : history.error ? (
        <WorkflowError error={history.error} retry={() => void history.refetch()} />
      ) : !history.data?.length ? (
        <section className="rounded-2xl border border-dashed border-border p-12 text-center">
          <CalendarDays className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h2 className="text-lg font-medium">Your days will appear here</h2>
          <p className="mt-2 text-sm text-muted-foreground">Start a conversation to build your first daily plan.</p>
          <Button asChild className="mt-5">
            <Link to="/new">Plan my day</Link>
          </Button>
        </section>
      ) : (
        <>
          <WeekStrip sessions={history.data} />
          <div className="space-y-3">
            {history.data.map((day) => (
              <DayRow key={day.sessionDate} day={day} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
