import { useState, useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { PromptInput } from "@/components/agents/prompt-input";
import { ConversationSidebar } from "@/components/ConversationSidebar";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function New() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (value: string) => {
    if (!value.trim()) return;

    const userMessage = value.trim();
    setInput("");
    setInputKey((prev) => prev + 1);

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
  };

  return (
    <div className="relative flex h-screen bg-background">
      <ConversationSidebar
        sessions={[]}
        selectedDate={new Date().toISOString().split("T")[0]}
        isLoading={false}
        onSelect={() => {}}
        onToday={() => {}}
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
              </>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-border bg-background px-4 py-4">
          <div className="mx-auto max-w-2xl">
            <PromptInput
              key={inputKey}
              value={input}
              onValueChange={setInput}
              onSubmit={handleSend}
              loading={false}
              disabled={false}
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
