import { AppShell } from '@/layouts/AppShell';
import { AppTopBar } from '@/components/AppTopBar';
import { useLocalDay } from '@/lib/useLocalDay';
import { useEffect } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { dateLabel, selectedDate } from '@/components/workflow/dates';
import { useWorkflow } from '@/lib/queries';
import { openTodayState } from '@/lib/dayEntry';
import { DayConversation } from '@/components/workflow/DayConversation';

export default function Conversation() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const today = useLocalDay();
  const date = selectedDate(params.get('date'), today);
  const intent = params.get('intent') || (location.state?.planningDay === date ? 'plan' : null);
  const seed = params.get('seed') || '';
  const taskId = params.get('taskId') || undefined;
  const workflow = useWorkflow(date);
  // Before Confirm the way out is a skip; afterwards, or from a past day,
  // it's just the way back to today's list.
  const backToToday = date < today || (workflow.data && workflow.data.state !== 'planning');
  useEffect(() => {
    if (!seed) return;
    const next = new URLSearchParams(params); next.delete('seed'); setParams(next, { replace: true });
  }, [seed, params, setParams]);
  return <AppShell conversation>
    <AppTopBar title="Conversation" status={dateLabel(date)} actions={workflow.isSuccess && (backToToday
      ? <Button asChild size="sm" variant="outline" className="shrink-0 text-xs max-md:min-h-11"><Link to="/today" state={openTodayState(today)}>Back to Today</Link></Button>
      : <Link to="/today" state={openTodayState(today)} className="inline-flex shrink-0 items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground max-md:min-h-11">Skip to my list</Link>)} />
    <main id="main-content" tabIndex={-1} className="daily-conversation-workspace">
      <DayConversation key={date} date={date} intent={intent} seed={seed} taskId={taskId} />
    </main>
  </AppShell>;
}
