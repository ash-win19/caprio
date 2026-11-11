import { AppShell } from '@/layouts/AppShell';
import { AppTopBar } from '@/components/AppTopBar';
import { useLocalDay } from '@/lib/useLocalDay';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { dateLabel } from '@/components/workflow/dates';
import { useWorkflow } from '@/lib/queries';
import { isConfirmed, openTodayState } from '@/lib/dayEntry';
import { DayConversation } from '@/components/workflow/DayConversation';

export default function Conversation() {
  const date = useLocalDay();
  const workflow = useWorkflow(date);
  // Before Confirm the way out is a skip; afterwards it's just the way back.
  const backToToday = isConfirmed(workflow.data);
  return <AppShell conversation>
    <AppTopBar title="Conversation" status={dateLabel(date)} actions={workflow.isSuccess && (backToToday
      ? <Button asChild size="sm" variant="outline" className="shrink-0 text-xs max-md:min-h-11"><Link to="/today" state={openTodayState(date)}>Back to Today</Link></Button>
      : <Link to="/today" state={openTodayState(date)} className="inline-flex shrink-0 items-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground max-md:min-h-11">Skip to my list</Link>)} />
    <main id="main-content" tabIndex={-1} className="daily-conversation-workspace">
      <DayConversation key={date} date={date} />
    </main>
  </AppShell>;
}
