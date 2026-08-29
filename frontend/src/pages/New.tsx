import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Mic, Loader2 } from 'lucide-react';
import { api, type ChatMessage, type ProcessResponse } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  response?: ProcessResponse;
}

export default function New() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState<ProcessResponse | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    // Load existing chat messages for today
    api.getChatMessages(today).then((data) => {
      const loadedMessages: Message[] = [];
      data.messages.forEach((msg) => {
        loadedMessages.push({
          role: msg.role,
          content: msg.content,
        });
      });
      setMessages(loadedMessages);
    }).catch(console.error);
  }, [today]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const result = await api.sendChatMessage(today, userMessage);
      
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.response.message,
          response: result.response,
        },
      ]);

      setCurrentResponse(result.response);
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleConfirm = async () => {
    if (!currentResponse?.proposedTasks || isConfirming) return;

    setIsConfirming(true);
    try {
      await api.confirmTasks(today, currentResponse.proposedTasks);
      navigate('/today');
    } catch (error) {
      console.error('Failed to confirm tasks:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showConfirmButton = currentResponse?.type === 'tasks' && currentResponse.proposedTasks && currentResponse.proposedTasks.length > 0;

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
              <h1 className="text-3xl font-medium text-foreground">
                How does your day look?
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Tell me what you need to accomplish today, and I'll help you organize it.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {showConfirmButton && (
        <div className="border-t border-border bg-background px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <Button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="w-full"
              size="lg"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your list...
                </>
              ) : (
                'Go to my list'
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="border-t border-border bg-background px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-end gap-3">
          <div className="relative flex-1">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                messages.length === 0
                  ? 'e.g., "I need to finish the report, have a team meeting, and go for a run"'
                  : 'Type your message...'
              }
              className="min-h-[52px] resize-none pr-12"
              rows={1}
            />
            <button
              type="button"
              className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground opacity-50 transition hover:opacity-75"
              title="Voice input (coming soon)"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[52px] w-[52px] shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
