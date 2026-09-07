import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock3, ListChecks } from 'lucide-react';
import { PromptInput } from '@/components/agents/prompt-input';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { Button } from '@/components/ui/button';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel, selectedDate } from '@/components/workflow/dates';
import { useChatSessions, useWorkflow } from '@/lib/queries';
import { localDate } from '@/lib/date';
import * as api from '@/lib/api';

function ConversationDay({ date }: { date: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflow(date);
  const workflow = workflowQuery.data;
  const [input, setInput] = useState('');
  const [lastRequest, setLastRequest] = useState<{ content: string; requestId: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const past = date < localDate();
  const readOnly = past || workflow?.state === 'closed';

  const refresh = () => {
    for (const key of ['workflow', 'tasks', 'inbox', 'bootstrap', 'chat-sessions']) void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const chat = useMutation({
    mutationFn: ({ content, requestId }: { content: string; requestId: string }) => api.sendChatMessage(content, date, requestId),
    onSuccess: (response) => {
      queryClient.setQueryData(['workflow', date], response.workflow);
      setInput('');
      setLastRequest(null);
      refresh();
    },
    onError: () => { void workflowQuery.refetch(); },
  });
  const confirm = useMutation({
    mutationFn: () => api.confirmDayPlan({ date, proposalId: workflow!.proposal!.id, version: workflow!.version }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['workflow', date], saved);
      refresh();
      navigate(`/today${date === localDate() ? '' : `?date=${date}`}`);
    },
    onError: () => { void workflowQuery.refetch(); },
  });
  const discard = useMutation({
    mutationFn: () => api.discardDayPlan({ date, proposalId: workflow!.proposal!.id, version: workflow!.version }),
    onSuccess: (saved) => {
      queryClient.setQueryData(['workflow', date], saved);
      confirm.reset();
      refresh();
    },
    onError: () => { void workflowQuery.refetch(); },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [workflow?.messages.length, workflow?.proposal?.id, chat.isPending]);

  const handleSend = (value: string) => {
    const content = value.trim();
    if (!content || chat.isPending || confirm.isPending || discard.isPending || readOnly) return;
    const request = lastRequest?.content === content ? lastRequest : { content, requestId: crypto.randomUUID() };
    setLastRequest(request);
    confirm.reset();
    discard.reset();
    chat.mutate(request);
  };
  const revise = () => {
    setInput('Change this plan: ');
    document.getElementById('day-message')?.focus();
  };
  const proposal = workflow?.proposal;
  const proposedToday = proposal?.tasks.filter((task) => task.disposition === 'today') || [];
  const proposedBacklog = proposal?.tasks.filter((task) => task.disposition === 'backlog') || [];
  const minutes = proposedToday.reduce((sum, task) => sum + task.duration, 0);

  return <main className="flex min-w-0 flex-1 flex-col">
    <header className="flex min-h-16 items-center justify-between gap-3 px-4 pl-16 md:px-8">
      <div><h1 className="text-sm font-medium">{past ? 'Conversation history' : workflow?.state === 'active' ? 'Adjust your plan' : 'Plan your day'}</h1><p className="mt-0.5 text-xs text-muted-foreground">{dateLabel(date)}</p></div>
      <Button asChild size="sm" variant="ghost"><Link to={`/today?date=${date}`}>View plan <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </header>
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-2xl space-y-6">
      {workflowQuery.isLoading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading your day…</p> : workflowQuery.error ? <WorkflowError error={workflowQuery.error} retry={() => void workflowQuery.refetch()} /> : <>
        {!workflow?.messages.length && <div className="flex min-h-[38vh] flex-col items-center justify-center text-center">
          <ListChecks className="mb-5 h-7 w-7 text-primary" />
          <h2 className="text-3xl font-medium">{past ? 'No conversation for this day' : 'What needs your attention?'}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{past ? 'Your saved plan and review are available from View plan.' : 'Tell me your tasks, fixed commitments, and how much time you have. We’ll turn them into a realistic plan.'}</p>
          {!past && !!workflow?.tasks.length && <p className="mt-4 text-sm text-primary">{workflow.tasks.length} saved {workflow.tasks.length === 1 ? 'task is' : 'tasks are'} already waiting for this day.</p>}
        </div>}
        {workflow?.messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'bg-accent text-foreground' : 'text-foreground'}`}>{message.content}</div></div>)}
        {chat.isPending && <div role="status" className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Working through your day…</div>}
        {chat.error && <WorkflowError error={chat.error} retry={lastRequest ? () => chat.mutate(lastRequest) : undefined} />}
        {proposal && !readOnly && <section aria-label="Proposed plan" className="rounded-2xl border border-primary/30 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">{workflow?.state === 'active' ? 'Proposed changes' : 'Your proposed plan'}</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">Needs your confirmation</span></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{proposal.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /><span>{minutes} min planned{proposal.availableMinutes !== null ? ` · ${proposal.availableMinutes} min available` : ''}</span></div>
          {([['For this day', proposedToday], ['Keep in inbox', proposedBacklog]] as const).map(([label, tasks]) => tasks.length > 0 && <div key={label} className="mt-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</h3>
            <ol className="space-y-2">{tasks.map((task, index) => <li key={task.id || `${label}-${index}`} className="rounded-lg bg-background p-3"><div className="flex items-start justify-between gap-4"><p className="text-sm font-medium">{task.title}</p><span className="shrink-0 text-xs text-muted-foreground">{task.duration} min</span></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{task.reason}</p></li>)}</ol>
          </div>)}
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Confirming saves this plan. Completed tasks stay completed.</p>
          {(confirm.error || discard.error) && <div className="mt-4"><WorkflowError error={confirm.error || discard.error} /></div>}
          <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => confirm.mutate()} disabled={chat.isPending || confirm.isPending || discard.isPending}>{confirm.isPending ? 'Saving plan…' : 'Confirm plan'}<ArrowRight className="ml-2 h-4 w-4" /></Button><Button variant="outline" onClick={revise} disabled={chat.isPending || confirm.isPending || discard.isPending}>Revise proposal</Button><Button variant="ghost" onClick={() => discard.mutate()} disabled={chat.isPending || confirm.isPending || discard.isPending}>{discard.isPending ? 'Discarding…' : 'Discard proposal'}</Button></div>
        </section>}
        {workflow?.state === 'closed' && <DaySummary workflow={workflow} />}
      </>}
      <div ref={messagesEndRef} />
    </div></div>
    <div className="bg-background px-4 pb-4 pt-2 md:px-8"><div className="mx-auto max-w-2xl">
      {readOnly ? <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground"><span>{past ? 'Past conversations are read-only.' : 'This day is closed.'}</span><Link to="/new" className="shrink-0 text-primary hover:underline">Go to today</Link></div> : <>
        <PromptInput id="day-message" value={input} onValueChange={setInput} onSubmit={handleSend} loading={chat.isPending} disabled={workflowQuery.isLoading || !!workflowQuery.error || chat.isPending || confirm.isPending || discard.isPending} aria-label="Message about your day" maxLength={8000} placeholder={workflow?.state === 'active' ? 'What changed? For example, a meeting took an extra hour…' : 'Finish a report, meet the team at 2, and go for a run. I have 4 hours…'} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Your tasks and constraints guide the plan. You confirm changes before they’re saved.</p>
      </>}
    </div></div>
  </main>;
}

export default function New() {
  const [params, setParams] = useSearchParams();
  const date = selectedDate(params.get('date'), localDate());
  const sessions = useChatSessions();
  return <div className="relative flex h-dvh bg-background">
    <ConversationSidebar sessions={sessions.data || []} selectedDate={date} isLoading={sessions.isLoading} onSelect={(value) => setParams({ date: value })} onToday={() => setParams({})} />
    <ConversationDay key={date} date={date} />
  </div>;
}
