import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ListChecks } from 'lucide-react';
import type { ChatThreadMessage } from '@/lib/api';

export function MessageBubble({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  return <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${role === 'user' ? 'bg-accent text-foreground' : 'text-foreground'}`}>{children}</div>
  </div>;
}

// A marker the app writes into the thread, such as a discarded or saved plan.
export function EventMarker({ children }: { children: string }) {
  return <p role="status" aria-label={children} className="text-center text-xs text-muted-foreground">{children}</p>;
}

// What one reply changed in the plan, written by the app under that reply.
export function PlanUpdatedLine({ children }: { children: string }) {
  return <p role="status" aria-label={children} className="flex items-center gap-1.5 px-4 text-xs text-muted-foreground">
    <ListChecks size={13} aria-hidden className="shrink-0" /><span className="min-w-0">{children}</span>
  </p>;
}

// The opener reads as Caprio's first line; other events are quiet markers.
export function ThreadEntry({ message }: { message: ChatThreadMessage }) {
  if (message.role !== 'event') return <MessageBubble role={message.role}>{message.content}</MessageBubble>;
  if (message.eventType === 'opener') return <MessageBubble role="assistant">{message.content}</MessageBubble>;
  if (message.eventType === 'plan_update') return <PlanUpdatedLine>{message.content}</PlanUpdatedLine>;
  return <EventMarker>{message.content}</EventMarker>;
}

// Shown from the moment a message is sent until the first token arrives.
export function ThinkingIndicator() {
  return <div role="status" className="flex items-center gap-2.5 px-4 py-3 text-sm text-muted-foreground">
    <span aria-hidden="true" className="flex items-center gap-1">
      {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-typing-dot motion-reduce:animate-none" style={{ animationDelay: `${dot * 160}ms` }} />)}
    </span>
    <span>Thinking…</span>
  </div>;
}

// The assistant's reply while tokens are still arriving.
export function StreamingReply({ text }: { text: string }) {
  return <div className="flex justify-start">
    <div aria-busy="true" className="max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed text-foreground">
      {text}
      <span aria-hidden="true" className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-foreground/80 animate-pulse motion-reduce:animate-none" />
    </div>
  </div>;
}

export function StoppedNotice({ retry }: { retry: () => void }) {
  return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
    <span>Reply stopped. Nothing was saved.</span>
    <Button type="button" variant="outline" size="sm" onClick={retry}>Try again</Button>
  </div>;
}
