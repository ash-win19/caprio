import { useMemo, useRef, useState, type RefObject } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  CalendarDays,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";
import { NAV_ITEMS, useReviewNav } from "@/lib/navigation";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { ChatSession } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { sidebarShortcutLabel, useSidebarFocus, useSidebarShortcut, useSidebarStore } from "@/lib/sidebar";
import { UserAvatar } from "@/components/UserAvatar";
import { CaprioMark, Logo } from "@/components/Logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ConversationSidebarProps {
  sessions: ChatSession[];
  selectedDate: string;
  isLoading: boolean;
  onSelect: (date: string) => void;
  onToday: () => void;
  externalToggle?: boolean;
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}


function SidebarContent({
  sessions,
  selectedDate,
  isLoading,
  onSelect,
  onToday,
  onClose,
  onCollapse,
  collapseButtonRef,
}: ConversationSidebarProps & {
  onClose?: () => void;
  onCollapse?: () => void;
  collapseButtonRef?: RefObject<HTMLButtonElement>;
}) {
  const user = useAppStore((state) => state.user);
  const { reviewPath } = useReviewNav();
  const [query, setQuery] = useState("");
  const visibleSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sessions;
    return sessions.filter((session) =>
      session.title.toLowerCase().includes(normalizedQuery),
    );
  }, [query, sessions]);

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
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <Link to="/today" className="inline-flex" aria-label="Go to today">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          {onCollapse && (
            <button
              ref={collapseButtonRef}
              type="button"
              onClick={onCollapse}
              className="rounded-md p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Collapse sidebar"
              aria-controls="conversation-sidebar"
              aria-expanded={true}
              aria-keyshortcuts="Meta+B Control+B"
              title={`Collapse sidebar (${sidebarShortcutLabel()})`}
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3">
        <nav aria-label="Primary" className="mb-3 space-y-1">
          {NAV_ITEMS.map(item => <NavLink key={item.path} to={item.path === '/review' ? reviewPath : item.path} onClick={onClose} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}><item.icon size={16} />{item.label}</NavLink>)}
        </nav>
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
            aria-label="Search conversations"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-6">
        <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Your conversations
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
                className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                  selectedDate === session.sessionDate
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                }`}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {session.title}
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

      <div className="border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              aria-label={user?.name ? `${user.name}'s account menu` : "Account menu"}
            >
              <UserAvatar user={user} className="h-9 w-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {user?.name || "Caprio user"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {user?.email || "View profile"}
                </span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuItem asChild>
              <Link to="/settings" onClick={onClose} className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const [ownMobileOpen, setOwnMobileOpen] = useState(false);
  const mobileOpen = props.mobileOpen ?? ownMobileOpen;
  const setMobileOpen = props.onMobileOpenChange ?? setOwnMobileOpen;
  const { reviewPath } = useReviewNav();
  const collapsed = useSidebarStore((state) => state.collapsed);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const desktopOpen = !collapsed;
  const asideRef = useRef<HTMLElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const user = useAppStore((state) => state.user);
  const shortcut = sidebarShortcutLabel();
  useSidebarShortcut();
  useSidebarFocus(collapsed, asideRef, collapseRef, expandRef, props.externalToggle);

  return (
    <>
      <aside
        ref={asideRef}
        id="conversation-sidebar"
        className={`fixed left-0 top-0 z-40 hidden h-dvh overflow-hidden border-r border-border bg-card transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:block ${desktopOpen ? "w-[240px]" : "w-16"}`}
      >
        <div
          aria-hidden={!desktopOpen}
          {...(!desktopOpen ? { inert: "" } : {})}
          className={`absolute inset-y-0 left-0 w-[239px] transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${desktopOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          <SidebarContent
            {...props}
            collapseButtonRef={collapseRef}
            onCollapse={props.externalToggle ? undefined : () => setCollapsed(true)}
          />
        </div>
        <div
          aria-hidden={desktopOpen}
          {...(desktopOpen ? { inert: "" } : {})}
          className={`absolute inset-y-0 left-0 flex w-[63px] flex-col items-center py-4 transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${desktopOpen ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <Link to="/today" aria-label="Go to today" className="p-2">
            <CaprioMark />
          </Link>
          {!props.externalToggle && <button
            ref={expandRef}
            type="button"
            onClick={() => setCollapsed(false)}
            className="mt-3 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Expand sidebar"
            aria-controls="conversation-sidebar"
            aria-expanded={false}
            aria-keyshortcuts="Meta+B Control+B"
            title={`Expand sidebar (${shortcut})`}
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>}
          <nav aria-label="Primary" className="mt-3 flex flex-col gap-1">
            {NAV_ITEMS.map(item => <NavLink key={item.path} to={item.path === '/review' ? reviewPath : item.path} aria-label={item.label} title={item.label} className={({ isActive }) => `grid h-10 w-10 place-items-center rounded-lg ${isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`}><item.icon size={18} /></NavLink>)}
          </nav>
          <div className="mt-auto flex w-full flex-col items-center border-t border-border pt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={user?.name ? `${user.name}'s account menu` : 'Account menu'}
                  title={user?.name || 'Caprio user'}
                  className="grid h-10 w-10 place-items-center rounded-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <UserAvatar user={user} className="h-8 w-8" fallbackClassName="bg-accent text-xs font-medium text-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56">
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {!props.externalToggle && <div className="absolute left-4 top-4 z-30 md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-card text-foreground shadow-float"
          id="conversation-history-trigger"
          aria-label="Open conversation history"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[min(88vw,320px)] p-0" onCloseAutoFocus={event => { event.preventDefault(); document.getElementById('conversation-history-trigger')?.focus(); }}>
          <SheetTitle className="sr-only">Conversation history</SheetTitle>
          <SheetDescription className="sr-only">Browse your planning conversations by day.</SheetDescription>
          <SidebarContent {...props} onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
