import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock3, ListChecks } from 'lucide-react';
import { PromptInput } from '@/components/agents/prompt-input';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { Button } from '@/components/ui/button';
import { MessageBubble, StoppedNotice, StreamingReply, ThinkingIndicator } from '@/components/workflow/ChatMessages';
import { DaySummary, WorkflowError } from '@/components/workflow/WorkflowUI';
import { dateLabel, selectedDate } from '@/components/workflow/dates';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from '@/lib/chat-models';
import { useChatSessions, useWorkflow } from '@/lib/queries';
import { useRevealedText } from '@/lib/hooks/use-revealed-text';
import { localDate } from '@/lib/date';
import * as api from '@/lib/api';

// A turn that has been sent but not yet committed by the server. The user's
// message stays visible through thinking, streaming, and failure, so a retry
// never loses what they typed. "settling" means the server has committed the
// reply and the last of its text is still being revealed on screen.
type PendingTurn = {
  requestId: string;
  content: string;
  model?: string;
  reply: string;
  status: 'thinking' | 'streaming' | 'settling' | 'failed' | 'stopped';
  savedCount: number;
  error?: unknown;
};

const isReplying = (turn: PendingTurn | null) => turn?.status === 'thinking' || turn?.status === 'streaming';

function ConversationDay({ date }: { date: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflow(date);
  const workflow = workflowQuery.data;
  const [input, setInput] = useState('');
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const past = date < localDate();
  const readOnly = past || workflow?.state === 'closed';
  const replying = isReplying(pending);
  const settling = pending?.status === 'settling';
  const shownReply = useRevealedText(pending && (pending.status === 'streaming' || settling) ? pending.reply : '');
  const settled = settling && shownReply === pending.reply;

  const refresh = () => {
    for (const key of ['workflow', 'tasks', 'inbox', 'bootstrap', 'chat-sessions']) void queryClient.invalidateQueries({ queryKey: [key] });
  };
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

  const updatePending = (requestId: string, update: (turn: PendingTurn) => PendingTurn) =>
    setPending((current) => (current?.requestId === requestId ? update(current) : current));

  const send = async (request: { content: string; requestId: string; model?: string }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending({ ...request, reply: '', status: 'thinking', savedCount: workflow?.messages.length ?? 0 });
    try {
      const response = await api.streamChatMessage({
        ...request,
        date,
        signal: controller.signal,
        onDelta: (text) => updatePending(request.requestId, (turn) => ({ ...turn, reply: turn.reply + text, status: 'streaming' })),
      });
      queryClient.setQueryData(['workflow', date], response.workflow);
      updatePending(request.requestId, (turn) => ({ ...turn, reply: response.text, status: 'settling' }));
      refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      updatePending(request.requestId, (turn) => ({ ...turn, status: 'failed', error }));
      void workflowQuery.refetch();
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const stop = () => {
    const controller = abortRef.current;
    if (!controller) return;
    abortRef.current = null;
    controller.abort();
    setPending((turn) => (turn && isReplying(turn) ? { ...turn, status: 'stopped' } : turn));
    void workflowQuery.refetch();
  };

  // Swap the revealed reply for the saved thread once the last character shows.
  useEffect(() => {
    if (settled) setPending(null);
  }, [settled]);

  // The server may have committed the turn even though this client gave up on
  // it. Once the saved thread contains the message, drop the pending copy.
  useEffect(() => {
    if (!pending || replying || settling) return;
    const messages = workflow?.messages ?? [];
    if (messages.some((message, index) => index >= pending.savedCount && message.role === 'user' && message.content === pending.content)) setPending(null);
  }, [workflow?.messages, pending, replying, settling]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const container = scrollRef.current;
    const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    if (pending?.status === 'streaming' && !nearBottom) return;
    const instant = pending?.status === 'streaming' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView?.({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
  }, [workflow?.messages.length, workflow?.proposal?.id, pending?.status, shownReply.length]);

  const handleSend = (value: string, selectedModel?: string) => {
    const content = value.trim();
    if (!content || replying || confirm.isPending || discard.isPending || readOnly) return;
    // Resending the same text after a failure reuses the request ID, so the
    // server never runs the model twice for one message.
    const requestId = pending && pending.content === content ? pending.requestId : crypto.randomUUID();
    confirm.reset();
    discard.reset();
    setInput('');
    void send({ content, requestId, model: selectedModel || model });
  };
  const retry = () => {
    if (pending) void send({ content: pending.content, requestId: pending.requestId, model: pending.model });
  };
  const revise = () => {
    setInput('Change this plan: ');
    document.getElementById('day-message')?.focus();
  };
  const proposal = workflow?.proposal;
  const proposedToday = proposal?.tasks.filter((task) => task.disposition === 'today') || [];
  const proposedBacklog = proposal?.tasks.filter((task) => task.disposition === 'backlog') || [];
  const minutes = proposedToday.reduce((sum, task) => sum + task.duration, 0);
  const busy = replying || confirm.isPending || discard.isPending;
  // While a reply is still being revealed, the thread shows the messages that
  // existed before it was sent; the pending turn stands in for the rest.
  const savedMessages = workflow?.messages ?? [];
  const messages = pending?.status === 'settling' ? savedMessages.slice(0, pending.savedCount) : savedMessages;

  return <main className="flex min-w-0 flex-1 flex-col">
    <header className="flex min-h-16 items-center justify-between gap-3 px-4 pl-16 md:px-8">
      <div><h1 className="text-sm font-medium">{past ? 'Conversation history' : workflow?.state === 'active' ? 'Adjust your plan' : 'Plan your day'}</h1><p className="mt-0.5 text-xs text-muted-foreground">{dateLabel(date)}</p></div>
      <Button asChild size="sm" variant="ghost"><Link to={`/today?date=${date}`}>View plan <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </header>
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-2xl space-y-6">
      {workflowQuery.isLoading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading your day…</p> : workflowQuery.error ? <WorkflowError error={workflowQuery.error} retry={() => void workflowQuery.refetch()} /> : <>
        {!messages.length && !pending && <div className="flex min-h-[38vh] flex-col items-center justify-center text-center">
          <ListChecks className="mb-5 h-7 w-7 text-primary" />
          <h2 className="text-3xl font-medium">{past ? 'No conversation for this day' : 'What needs your attention?'}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{past ? 'Your saved plan and review are available from View plan.' : 'Tell me your tasks, fixed commitments, and how much time you have. We’ll turn them into a realistic plan.'}</p>
          {!past && !!workflow?.tasks.length && <p className="mt-4 text-sm text-primary">{workflow.tasks.length} saved {workflow.tasks.length === 1 ? 'task is' : 'tasks are'} already waiting for this day.</p>}
        </div>}
        {messages.map((message) => <MessageBubble key={message.id} role={message.role}>{message.content}</MessageBubble>)}
        {pending && <>
          <MessageBubble role="user">{pending.content}</MessageBubble>
          {pending.status === 'thinking' && <ThinkingIndicator />}
          {(pending.status === 'streaming' || pending.status === 'settling') && <StreamingReply text={shownReply} />}
          {pending.status === 'failed' && <WorkflowError error={pending.error} retry={retry} />}
          {pending.status === 'stopped' && <StoppedNotice retry={retry} />}
        </>}
        {proposal && !readOnly && !settling && <section aria-label="Proposed plan" className="rounded-2xl border border-primary/30 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-medium">{workflow?.state === 'active' ? 'Proposed changes' : 'Your proposed plan'}</h2><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">Needs your confirmation</span></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{proposal.summary}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /><span>{minutes} min planned{proposal.availableMinutes !== null ? ` · ${proposal.availableMinutes} min available` : ''}</span></div>
          {([['For this day', proposedToday], ['Keep in inbox', proposedBacklog]] as const).map(([label, tasks]) => tasks.length > 0 && <div key={label} className="mt-5">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</h3>
            <ol className="space-y-2">{tasks.map((task, index) => <li key={task.id || `${label}-${index}`} className="rounded-lg bg-background p-3"><div className="flex items-start justify-between gap-4"><p className="text-sm font-medium">{task.title}</p><span className="shrink-0 text-xs text-muted-foreground">{task.duration} min</span></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{task.reason}</p></li>)}</ol>
          </div>)}
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Confirming saves this plan. Completed tasks stay completed.</p>
          {(confirm.error || discard.error) && <div className="mt-4"><WorkflowError error={confirm.error || discard.error} /></div>}
          <div className="mt-4 flex flex-wrap gap-2"><Button onClick={() => confirm.mutate()} disabled={busy}>{confirm.isPending ? 'Saving plan…' : 'Confirm plan'}<ArrowRight className="ml-2 h-4 w-4" /></Button><Button variant="outline" onClick={revise} disabled={busy}>Revise proposal</Button><Button variant="ghost" onClick={() => discard.mutate()} disabled={busy}>{discard.isPending ? 'Discarding…' : 'Discard proposal'}</Button></div>
        </section>}
        {workflow?.state === 'closed' && <DaySummary workflow={workflow} />}
      </>}
      <div ref={messagesEndRef} />
    </div></div>
    <div className="bg-background px-4 pb-4 pt-2 md:px-8"><div className="mx-auto max-w-2xl">
      {readOnly ? <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground"><span>{past ? 'Past conversations are read-only.' : 'This day is closed.'}</span><Link to="/new" className="shrink-0 text-primary hover:underline">Go to today</Link></div> : <>
        <PromptInput id="day-message" value={input} onValueChange={setInput} models={CHAT_MODELS} model={model} defaultModel={DEFAULT_CHAT_MODEL} onModelChange={setModel} onSubmit={handleSend} loading={replying} onStop={stop} disabled={workflowQuery.isLoading || !!workflowQuery.error || confirm.isPending || discard.isPending} aria-label="Message about your day" maxLength={8000} placeholder={workflow?.state === 'active' ? 'What changed? For example, a meeting took an extra hour…' : 'Finish a report, meet the team at 2, and go for a run. I have 4 hours…'} />
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
