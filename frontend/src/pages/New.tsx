import { AppShell } from '@/layouts/AppShell';
import { AppTopBar } from '@/components/AppTopBar';
import { useLocalDay } from '@/lib/useLocalDay';
import { useNavigationState } from '@/lib/dateDrafts';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { Button } from '@/components/ui/button';
import { selectedDate } from '@/components/workflow/dates';
import { useChatSessions, useWorkflow } from '@/lib/queries';
import { DayConversation } from '@/components/workflow/DayConversation';

export default function New() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const today = useLocalDay();
  const date = selectedDate(params.get('date'), today);
  const intent = params.get('intent') || (location.state?.planningDay === date ? 'plan' : null);
  const seed = params.get('seed') || '';
  const taskId = params.get('taskId') || undefined;
  const sessions = useChatSessions();
  const workflow = useWorkflow(date);
  const remaining = workflow.data?.tasks.filter(task => !task.completed && task.status !== 'dropped') ?? [];
  const carriedCount = remaining.filter(task => task.deferCount > 0).length;
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (!seed) return;
    const next = new URLSearchParams(params); next.delete('seed'); setParams(next, { replace: true });
  }, [seed, params, setParams]);
  const selectDate = (value: string) => {
    if (!useNavigationState.getState().locked) setParams({ date: value });
  };
  return <AppShell conversation onOpenConversations={() => setHistoryOpen(true)} sidebar={<ConversationSidebar externalToggle mobileOpen={historyOpen} onMobileOpenChange={setHistoryOpen} sessions={sessions.data || []} selectedDate={date} isLoading={sessions.isLoading} onSelect={selectDate} onToday={() => selectDate(today)} />}>
    <AppTopBar title={date < today ? 'Conversation history' : intent !== 'plan' && workflow.data?.state === 'active' && workflow.data.tasks.length > 0 ? 'Adjust plan' : 'Plan'} date={date} actions={<div className="conversation-task-context">
      {workflow.isSuccess && workflow.data.tasks.length > 0 && <span role="status" aria-label="Task summary" aria-atomic="true" className="conversation-task-summary text-xs text-muted-foreground">
        <span>{remaining.length} remaining</span>
        {carriedCount > 0 && <><span aria-hidden="true" className="conversation-task-separator">·</span><span className="text-cap-blue">{carriedCount} carried forward</span></>}
      </span>}
      <Button asChild size="sm" variant="outline" className="shrink-0 text-xs max-md:min-h-11"><Link to={`/today?date=${date}`}>View tasks</Link></Button>
    </div>} />
    <main id="main-content" tabIndex={-1} className="daily-conversation-workspace">
      <DayConversation key={date} date={date} intent={intent} seed={seed} taskId={taskId} />
    </main>
  </AppShell>;
}
