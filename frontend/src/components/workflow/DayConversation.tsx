import { useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { useDateDraft, useNavigationLock } from '@/lib/dateDrafts';
import { useLocalDay } from '@/lib/useLocalDay';
import { PromptInput } from '@/components/agents/prompt-input';
import { SpeechMicButton } from '@/components/agents/SpeechMicButton';
import { Button } from '@/components/ui/button';
import { MessageBubble, StoppedNotice, StreamingReply, ThinkingIndicator, ThreadEntry } from './ChatMessages';
import { WorkflowError } from './WorkflowUI';
import { PlanCard } from './PlanCard';
import { dateLabel } from './dates';
import { toast } from '@/hooks/use-toast';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, FALLBACK_CHAT_MODEL } from '@/lib/chat-models';
import { shouldFallbackToGroq } from '@/lib/chat-resilience';
import { useWorkflow } from '@/lib/queries';
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

const INTERRUPT_CHIPS = [
  { label: 'Meeting ran over', text: 'A meeting ran over and I have less time today. ' },
  { label: 'Add work', text: 'I need to add work to today: ' },
  { label: 'Cut scope', text: 'I need to cut scope from today. ' },
] as const;

export function DayConversation({ date, intent, seed, taskId }: { date: string; intent: string | null; seed: string; taskId?: string }) {
  const navigate = useNavigate();
  const openSavedPlan = useCallback(() => {
    navigate(date === localDate() ? '/today' : `/today?date=${date}`, { state: { savedPlanDate: date } });
  }, [date, navigate]);
  const queryClient = useQueryClient();
  const workflowQuery = useWorkflow(date);
  const workflow = workflowQuery.data;
  const [input, setInput] = useDateDraft('composer', date, '');
  const [model, setModel] = useDateDraft('chat-model', date, DEFAULT_CHAT_MODEL);
  const [pending, setPending] = useDateDraft<PendingTurn | null>('pending-turn', date, null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const today = useLocalDay();
  const past = date < today;
  const mounted = useRef(true);
  const consumedSeed = useRef('');
  const readOnly = past;
  const replying = isReplying(pending);
  const settling = pending?.status === 'settling';
  const shownReply = useRevealedText(pending && (pending.status === 'streaming' || settling) ? pending.reply : '');
  const settled = settling && shownReply === pending.reply;
  const showInterruptChips = !readOnly && (intent === 'interrupt' || (intent !== 'plan' && workflow?.state === 'active' && workflow.tasks.length > 0));

  useEffect(() => {
    if (seed.trim() && seed !== consumedSeed.current) {
      consumedSeed.current = seed;
      setInput(previous => previous ? `${previous}\n${seed}` : seed);
    }
    if (!seed) consumedSeed.current = '';
  }, [seed, setInput]);

  const refresh = () => {
    for (const key of ['workflow', 'tasks', 'inbox', 'bootstrap', 'chat-sessions']) void queryClient.invalidateQueries({ queryKey: [key] });
  };
  const confirm = useMutation({
    mutationFn: () => api.confirmDayPlan({ date, draftId: workflow!.plan!.draftId, version: workflow!.version }),
    onSuccess: (saved) => {
      if (!mounted.current) return;
      queryClient.setQueryData(['workflow', date], saved);
      refresh();
      openSavedPlan();
    },
    onError: () => { void workflowQuery.refetch(); },
  });
  const discard = useMutation({
    mutationFn: () => api.discardDayPlan({ date, draftId: workflow!.plan!.draftId, version: workflow!.version }),
    onSuccess: (saved) => {
      if (!mounted.current) return;
      queryClient.setQueryData(['workflow', date], saved);
      confirm.reset();
      refresh();
    },
    onError: () => { void workflowQuery.refetch(); },
  });

  const updatePending = (requestId: string, update: (turn: PendingTurn) => PendingTurn) =>
    setPending((current) => (current?.requestId === requestId ? update(current) : current));

  const send = async (request: { content: string; requestId: string; model?: string }, opts?: { allowFallback?: boolean }) => {
    const allowFallback = opts?.allowFallback !== false;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending({ ...request, reply: '', status: 'thinking', savedCount: workflow?.messages.length ?? 0 });
    try {
      const response = await api.streamChatMessage({
        ...request,
        date,
        taskId,
        signal: controller.signal,
        onDelta: (text) => {
          if (!controller.signal.aborted && mounted.current) updatePending(request.requestId, (turn) => ({ ...turn, reply: turn.reply + text, status: 'streaming' }));
        },
      });
      if (controller.signal.aborted || !mounted.current) return;
      queryClient.setQueryData(['workflow', date], response.workflow);
      updatePending(request.requestId, (turn) => ({ ...turn, reply: response.text, status: 'settling' }));
      refresh();
    } catch (error) {
      if (controller.signal.aborted) return;
      if (allowFallback && shouldFallbackToGroq(error, request.model)) {
        setModel(FALLBACK_CHAT_MODEL);
        toast({ title: 'Switched to GPT-OSS 20B', description: 'The previous model was unavailable. Retrying with GPT-OSS 20B.' });
        await send({ ...request, model: FALLBACK_CHAT_MODEL }, { allowFallback: false });
        return;
      }
      updatePending(request.requestId, (turn) => ({ ...turn, status: 'failed', error }));
      refresh();
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
    refresh();
  };

  // Swap the revealed reply for the saved thread once the last character shows.
  useEffect(() => {
    if (!settled) return;
    setPending(null);
  }, [settled, setPending]);

  // The server may have committed the turn even though this client gave up on
  // it. Once the saved thread contains the message, drop the pending copy.
  useEffect(() => {
    if (!pending || replying || settling) return;
    const messages = workflow?.messages ?? [];
    if (messages.some((message, index) => index >= pending.savedCount && message.role === 'user' && message.content === pending.content)) {
      setPending(null);
    }
  }, [workflow, pending, replying, settling, setPending]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      setPending(turn => turn && isReplying(turn) ? { ...turn, status: 'stopped' } : turn);
    };
  }, [setPending]);

  useEffect(() => {
    const container = scrollRef.current;
    const nearBottom = !container || container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    if (pending?.status === 'streaming' && !nearBottom) return;
    const instant = pending?.status === 'streaming' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView?.({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
  }, [workflow?.messages.length, pending?.status, shownReply.length]);

  const handleSend = (value: string, selectedModel?: string) => {
    const content = value.trim();
    if (!content || replying || confirm.isPending || discard.isPending || undo.isPending || readOnly) return;
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
  const undo = useMutation({
    mutationFn: api.undoTaskChange,
    onSuccess: (saved) => { queryClient.setQueryData(['workflow', date], saved); refresh(); },
    onError: () => { void workflowQuery.refetch(); },
  });
  const plan = workflow?.plan;
  const busy = replying || confirm.isPending || discard.isPending || undo.isPending;
  useNavigationLock(busy, Boolean(input.trim()) || Boolean(pending && !settling));
  // While a reply is still being revealed, the thread shows the messages that
  // existed before it was sent; the pending turn stands in for the rest.
  const savedMessages = workflow?.messages ?? [];
  const messages = pending?.status === 'settling' ? savedMessages.slice(0, pending.savedCount) : savedMessages;
  // The opener stays at the top while the first reply settles and is saved.
  const opener = workflow?.opener ?? savedMessages.find(message => message.eventType === 'opener')?.content;
  const showOpener = Boolean(opener) && !messages.some(message => message.eventType === 'opener');

  return <>
    <section aria-label="Planning conversation" className="conversation-main [overflow-wrap:anywhere]">
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8"><div className="mx-auto max-w-2xl space-y-6">
      {workflowQuery.isLoading ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading your day…</p> : workflowQuery.error ? <WorkflowError error={workflowQuery.error} retry={() => void workflowQuery.refetch()} /> : <>
        {!messages.length && !pending && !plan && !opener && workflow?.state !== 'closed' && <div className="flex min-h-[38vh] flex-col items-center justify-center text-center">
          <ListChecks className="mb-5 h-7 w-7 text-primary" />
          <h2 className="text-3xl font-medium">{past ? 'No conversation for this day' : showInterruptChips ? 'What changed?' : 'What needs your attention?'}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{past ? 'Your saved plan and review are available from View tasks.' : showInterruptChips ? 'Tell Caprio what shifted: less time, new work, or something to drop. Review the draft, then confirm to update your list.' : 'Tell me what you need to do. Review the draft plan, then confirm to save your tasks.'}</p>
        </div>}
        {showOpener && <MessageBubble role="assistant">{opener}</MessageBubble>}
        {messages.map(message => <ThreadEntry key={message.id} message={message} />)}
        {pending && <>
          <MessageBubble role="user">{pending.content}</MessageBubble>
          {pending.status === 'thinking' && <ThinkingIndicator />}
          {(pending.status === 'streaming' || pending.status === 'settling') && <StreamingReply text={shownReply} />}
          {pending.status === 'failed' && <div><p className="mb-2 text-sm font-medium">Not saved</p><WorkflowError error={pending.error} retry={retry} /></div>}
          {pending.status === 'stopped' && <StoppedNotice retry={retry} />}
        </>}
        {/* The latest message, not the draft card below it, is what a new turn scrolls to. */}
        <div ref={messagesEndRef} />
        {(workflow?.changeReceipts?.length ?? 0) > 0 && <section aria-label="Saved task changes" className="space-y-3">
          {workflow!.changeReceipts!.map(receipt => <div key={receipt.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium">{receipt.undone ? 'Undone' : receipt.summary}</p><Button size="sm" variant="outline" disabled={busy || !receipt.canUndo || past} onClick={() => undo.mutate(receipt.id)} aria-label={`Undo ${receipt.summary.toLowerCase()}`}>{undo.isPending && undo.variables === receipt.id ? 'Undoing…' : 'Undo'}</Button></div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{receipt.changes.map(change => <li key={change.taskId}>{change.title}<span className="ml-2 text-xs">{change.action} · {dateLabel(change.date)}</span></li>)}</ul>
            {!receipt.undone && receipt.undoReason && <p className="mt-2 text-xs text-muted-foreground">{receipt.undoReason}</p>}
          </div>)}
          {undo.error && <WorkflowError error={undo.error} />}
        </section>}
        {plan && !readOnly && !settling && <PlanCard plan={plan} date={date} busy={busy} confirming={confirm.isPending} discarding={discard.isPending}
          error={(confirm.error || discard.error) && <WorkflowError error={confirm.error || discard.error} />}
          onConfirm={() => confirm.mutate()} onDiscard={() => discard.mutate()} />}
        {workflow?.state === 'closed' && !past && <p className="text-sm text-muted-foreground">Your review is saved. Add new work to continue this day; completed tasks and earlier reviews stay recorded.</p>}
      </>}
    </div></div>
    <div className="conversation-composer bg-background px-4 pb-4 pt-2 md:px-8"><div className="mx-auto max-w-2xl">
      {readOnly ? <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground"><span>{past ? 'Past conversations are read-only.' : 'This day is closed.'}</span><Link to="/new" className="shrink-0 text-primary hover:underline">Go to today</Link></div> : <>
        {showInterruptChips && !pending && !input && !plan && <div className="mb-3 flex flex-wrap gap-2" aria-label="Quick interruption prompts">
          {INTERRUPT_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => { setInput(chip.text); document.getElementById('day-message')?.focus(); }}
            >
              {chip.label}
            </button>
          ))}
        </div>}
        <PromptInput id="day-message" value={input} onValueChange={setInput} models={CHAT_MODELS} model={model} defaultModel={DEFAULT_CHAT_MODEL} onModelChange={setModel} onSubmit={handleSend} loading={replying} onStop={stop} disabled={workflowQuery.isLoading || !!workflowQuery.error || confirm.isPending || discard.isPending || undo.isPending} leadingAction={<SpeechMicButton value={input} onTranscript={setInput} disabled={workflowQuery.isLoading || !!workflowQuery.error || confirm.isPending || discard.isPending || undo.isPending || replying} />} aria-label="Message about your day" maxLength={8000} placeholder={showInterruptChips ? 'Add a task or tell me what changed…' : 'Tell me what you want to work on…'} />
      </>}
    </div></div>
  </section></>;
}
