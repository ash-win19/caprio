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
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    if (!seed) return;
    const next = new URLSearchParams(params); next.delete('seed'); setParams(next, { replace: true });
  }, [seed, params, setParams]);
  const selectDate = (value: string) => {
    if (!useNavigationState.getState().locked) setParams({ date: value });
  };
  return <AppShell conversation onOpenConversations={() => setHistoryOpen(true)} sidebar={<ConversationSidebar externalToggle mobileOpen={historyOpen} onMobileOpenChange={setHistoryOpen} sessions={sessions.data || []} selectedDate={date} isLoading={sessions.isLoading} onSelect={selectDate} onToday={() => selectDate(today)} />}>
    <AppTopBar title={date < today ? 'Conversation history' : intent !== 'plan' && workflow.data?.state === 'active' && workflow.data.tasks.length > 0 ? 'Adjust plan' : 'Plan'} date={date} actions={<div className="flex items-center gap-3"><span aria-live="polite" className="text-xs text-muted-foreground">{workflow.data?.tasks.length ?? 0} saved {workflow.data?.tasks.length === 1 ? 'task' : 'tasks'}</span><Button asChild size="sm" variant="outline"><Link to={`/today?date=${date}`}>View tasks</Link></Button></div>} />
    <main id="main-content" tabIndex={-1} className="daily-conversation-workspace">
      <DayConversation key={date} date={date} intent={intent} seed={seed} taskId={taskId} />
    </main>
  </AppShell>;
}
