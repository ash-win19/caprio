import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";
import type { ChatSession } from "@/lib/api";
import { useAppStore } from "@/lib/store";

interface ConversationSidebarProps {
  sessions: ChatSession[];
  selectedDate: string;
  isLoading: boolean;
  onSelect: (date: string) => void;
  onToday: () => void;
}

function CaprioMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 88"
      fill="none"
      role="img"
      aria-label="Caprio"
      className="h-5 w-auto shrink-0 text-foreground"
    >
      <g fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M16 6
             H48
             A6 6 0 0 1 54 12
             C54 26 46 34 32 44
             C46 54 54 62 54 76
             A6 6 0 0 1 48 82
             H16
             A6 6 0 0 1 10 76
             C10 62 18 54 32 44
             C18 34 10 26 10 12
             A6 6 0 0 1 16 6
             Z"
          fill="none"
          strokeWidth="7"
        />
        <path d="M22 78 L32 62 L42 78 Z" stroke="none"/>
      </g>
    </svg>
  );
}

function formatSessionDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function SidebarContent({
  sessions,
  selectedDate,
  isLoading,
  onSelect,
  onToday,
  onClose,
  onCollapse,
}: ConversationSidebarProps & {
  onClose?: () => void;
  onCollapse?: () => void;
}) {
  const user = useAppStore((state) => state.user);
  const [query, setQuery] = useState("");
  const visibleSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sessions;
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sessions]);
  const initial = user?.name?.trim().charAt(0).toUpperCase() || "C";

  const chooseSession = (date: string) => {
    onSelect(date);
    onClose?.();
  };

  const showToday = () => {
    onToday();
    onClose?.();
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between px-4 pb-3 pt-4">
        <Link
          to="/today"
          className="flex items-center gap-2.5"
          aria-label="Go to today"
        >
          <CaprioMark />
          <span className="text-base font-semibold tracking-tight text-foreground">
            caprio
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Close conversation history"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={showToday}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent"
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          Today's conversation
        </button>

        <label className="relative mt-3 block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-6">
        <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Previous conversations
        </p>
        <div className="mt-2 space-y-1">
          {isLoading ? (
            <div
              className="space-y-2 px-2 py-2"
              aria-label="Loading conversation history"
            >
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-12 animate-pulse rounded-lg bg-muted"
                />
              ))}
            </div>
          ) : visibleSessions.length > 0 ? (
            visibleSessions.map((session) => (
              <button
                key={session.sessionDate}
                type="button"
                onClick={() => chooseSession(session.sessionDate)}
                className={`group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left transition ${
                  selectedDate === session.sessionDate
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {session.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {formatSessionDate(session.sessionDate)} ·{" "}
                    {session.messageCount} messages
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
              {query
                ? "No matching conversations."
                : "Your conversations will appear here."}
            </p>
          )}
        </div>
      </div>

      <Link
        to="/settings"
        className="flex items-center gap-3 border-t border-border px-4 py-4 transition hover:bg-accent/60"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {initial}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-foreground">
            {user?.name || "Caprio user"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {user?.email || "View profile"}
          </span>
        </span>
      </Link>
    </div>
  );
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const user = useAppStore((state) => state.user);
  const initial = user?.name?.trim().charAt(0).toUpperCase() || "C";

  return (
    <>
      {desktopOpen ? (
        <aside
          id="conversation-sidebar"
          className="hidden h-screen w-[280px] shrink-0 border-r border-border md:block"
        >
          <SidebarContent
            {...props}
            onCollapse={() => setDesktopOpen(false)}
          />
        </aside>
      ) : (
        <aside className="hidden h-screen w-16 shrink-0 flex-col items-center border-r border-border bg-card py-4 md:flex">
          <Link to="/today" aria-label="Go to today" className="p-2">
            <CaprioMark />
          </Link>
          <button
            type="button"
            onClick={() => setDesktopOpen(true)}
            className="mt-3 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
            aria-label="Expand sidebar"
            aria-controls="conversation-sidebar"
            aria-expanded="false"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
          <Link
            to="/settings"
            aria-label={user?.name ? `Open ${user.name}'s profile` : "Open profile"}
            className="mt-auto grid h-10 w-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            title={user?.name || "Caprio user"}
          >
            {initial}
          </Link>
        </aside>
      )}

      <div className="absolute left-4 top-4 z-30 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground shadow-float"
          aria-label="Open conversation history"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-label="Close conversation history"
          />
          <aside className="relative h-full w-[min(88vw,320px)] border-r border-border shadow-2xl">
            <SidebarContent {...props} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
