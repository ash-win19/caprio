import { useCallback, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Loader2 } from "lucide-react";
import { api, type ChatMessage, type ProcessResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PromptInput } from "@/components/agents/prompt-input";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import type { ChatSession } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  response?: ProcessResponse;
}

export default function New() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [currentResponse, setCurrentResponse] =
    useState<ProcessResponse | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedDateRef = useRef(selectedDate);

  const today = new Date().toISOString().split("T")[0];

  const loadSessions = useCallback(() => {
    setIsHistoryLoading(true);
    return api
      .getChatSessions()
      .then((data) => setSessions(data.sessions))
      .catch(console.error)
      .finally(() => setIsHistoryLoading(false));
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    let ignore = false;
    setMessages([]);
    setCurrentResponse(null);
    api
      .getChatMessages(selectedDate)
      .then((data) => {
        if (ignore) return;
        const loadedMessages: Message[] = [];
        data.messages.forEach((msg) => {
          loadedMessages.push({
            role: msg.role,
            content: msg.content,
          });
        });
        setMessages(loadedMessages);
      })
      .catch((error) => {
        if (!ignore) console.error(error);
      });

    return () => {
      ignore = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (value: string) => {
    if (!value.trim() || isLoading) return;

    const userMessage = value.trim();
    const requestDate = selectedDate;
    setInput("");
    setInputKey(prev => prev + 1);
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    try {
      const result = await api.sendChatMessage(requestDate, userMessage);
      if (selectedDateRef.current === requestDate) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.response.message,
            response: result.response,
          },
        ]);
        setCurrentResponse(result.response);
      }
      void loadSessions();
    } catch (error) {
      console.error("Failed to send message:", error);
      if (selectedDateRef.current === requestDate) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Sorry, something went wrong. Please try again.",
          },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentResponse?.proposedTasks || isConfirming) return;

    setIsConfirming(true);
    const requestDate = selectedDate;
    try {
      await api.confirmTasks(requestDate, currentResponse.proposedTasks);
      if (selectedDateRef.current === requestDate) navigate("/today");
    } catch (error) {
      console.error("Failed to confirm tasks:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  const selectDate = useCallback((date: string) => {
    selectedDateRef.current = date;
    setSelectedDate(date);
  }, []);

  const showConfirmButton =
    currentResponse?.type === "tasks" &&
    currentResponse.proposedTasks &&
    currentResponse.proposedTasks.length > 0;

  return (
    <div className="relative flex h-screen bg-background">
      <ConversationSidebar
        sessions={sessions}
        selectedDate={selectedDate}
        isLoading={isHistoryLoading}
        onSelect={selectDate}
        onToday={() => selectDate(today)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-2xl space-y-6">
            {messages.length === 0 ? (
              <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                <h1 className="text-3xl font-medium text-foreground">
                  How does your day look?
                </h1>
                <p className="mt-3 text-sm text-muted-foreground">
                  Tell me what you need to accomplish today, and I'll help you
                  organize it.
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
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
                      <span className="text-sm text-muted-foreground">
                        Thinking...
                      </span>
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
                  "Go to my list"
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="border-t border-border bg-background px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <PromptInput
              key={inputKey}
              value={input}
              onValueChange={setInput}
              onSubmit={handleSend}
              loading={isLoading}
              disabled={isLoading}
              placeholder={
                messages.length === 0
                  ? 'e.g., "I need to finish the report, have a team meeting, and go for a run"'
                  : "Type your message..."
              }
              leadingAction={
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-50 transition hover:opacity-75"
                  title="Voice input (coming soon)"
                  disabled
                >
                  <Mic className="h-4 w-4" />
                </button>
              }
            />
          </div>
        </div>
      </main>
    </div>
  );
}
