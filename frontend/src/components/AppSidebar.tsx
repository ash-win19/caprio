import { useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Inbox, CheckSquare, History, Settings, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { SIDEBAR_WIDTH_CLASS, sidebarShortcutLabel, useSidebarFocus, useSidebarShortcut, useSidebarStore } from '@/lib/sidebar';
import { useWorkflow } from '@/lib/queries';
import { localDate } from '@/lib/date';
import { UserAvatar } from '@/components/UserAvatar';
import { CaprioMark, Logo } from '@/components/Logo';

const NAV_ITEMS = [
  { label: 'Today', path: '/today', icon: LayoutGrid },
  { label: 'Plan', path: '/new', icon: MessageSquare },
  { label: 'Inbox', path: '/capture', icon: Inbox },
  { label: 'Review', path: '/review', icon: CheckSquare },
  { label: 'History', path: '/momentum', icon: History },
];

const railLink = ({ isActive }: { isActive: boolean }) =>
  `grid h-10 w-10 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
  }`;

const toggleButton = 'rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

function ReviewBadge({ pending, count, compact = false }: { pending: boolean; count: number; compact?: boolean }) {
  if (!pending) return null;
  if (compact) {
    return <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />;
  }
  return count > 0
    ? <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary" aria-label={`${count} unfinished`}>{count}</span>
    : <span className="ml-auto h-2 w-2 rounded-full bg-primary" aria-hidden />;
}


function useReviewNav() {
  const today = localDate();
  const todayWorkflow = useWorkflow(today);
  const reviewDate = todayWorkflow.data?.oldestUnclosedDate || today;
  const reviewWorkflow = useWorkflow(reviewDate);
  const recovering = reviewDate < today;
  const reviewPath = recovering ? `/review?date=${reviewDate}&reopen=1` : '/review';
  const tasks = reviewWorkflow.data?.tasks || [];
  const reviewPending = reviewWorkflow.data?.state !== 'closed' && (recovering || reviewWorkflow.data?.state === 'active' || tasks.length > 0);
  const unfinished = tasks.filter((task) => !task.completed).length;
  return { reviewPath, reviewPending, unfinished };
}

export function AppSidebar() {
  const user = useAppStore((s) => s.user);
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const asideRef = useRef<HTMLElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const shortcut = sidebarShortcutLabel();
  const { reviewPath, reviewPending, unfinished } = useReviewNav();
  useSidebarShortcut();
  useSidebarFocus(collapsed, asideRef, collapseRef, expandRef);

  return (
    <aside
      ref={asideRef}
      id="app-sidebar"
      className={`fixed left-0 top-0 z-40 hidden h-screen overflow-hidden border-r border-border bg-card transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:block ${collapsed ? SIDEBAR_WIDTH_CLASS.collapsed : SIDEBAR_WIDTH_CLASS.expanded}`}
    >
      <div
        aria-hidden={collapsed}
        {...(collapsed ? { inert: '' } : {})}
        className={`absolute inset-y-0 left-0 flex w-[239px] flex-col transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      >
        <div className="flex items-center justify-between py-5 pl-5 pr-3">
          <Link to="/today" aria-label="Go to today" className="inline-flex">
            <Logo />
          </Link>
          <button
            ref={collapseRef}
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            aria-expanded={true}
            aria-controls="app-sidebar"
            aria-keyshortcuts="Meta+B Control+B"
            title={`Collapse sidebar (${shortcut})`}
            className={`p-2 ${toggleButton}`}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Primary" className="flex-1 space-y-1 px-3 py-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path === '/review' ? reviewPath : item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? '-ml-[2px] border-l-2 border-primary bg-accent text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`
              }
            >
              <item.icon size={16} />
              {item.label}
              {item.path === '/review' && <ReviewBadge pending={reviewPending} count={unfinished} />}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-3 py-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
              }`
            }
          >
            <Settings size={16} />
            Settings
          </NavLink>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <UserAvatar user={user} className="h-8 w-8" fallbackClassName="bg-accent text-xs font-medium text-foreground" />
          <span className="truncate text-xs text-muted-foreground">{user?.name || 'Caprio user'}</span>
        </div>
      </div>

      <div
        aria-hidden={!collapsed}
        {...(!collapsed ? { inert: '' } : {})}
        className={`absolute inset-y-0 left-0 flex w-[63px] flex-col items-center py-4 transition-opacity duration-200 ease-in-out motion-reduce:transition-none ${collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        <Link to="/today" aria-label="Go to today" className="p-2">
          <CaprioMark />
        </Link>
        <button
          ref={expandRef}
          type="button"
          onClick={toggle}
          aria-label="Expand sidebar"
          aria-expanded={false}
          aria-controls="app-sidebar"
          aria-keyshortcuts="Meta+B Control+B"
          title={`Expand sidebar (${shortcut})`}
          className={`mt-3 grid h-10 w-10 place-items-center rounded-lg ${toggleButton}`}
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>

        <nav aria-label="Primary" className="mt-3 flex flex-col items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path === '/review' ? reviewPath : item.path} aria-label={item.label} title={item.label} className={({ isActive }) => `${railLink({ isActive })} relative`}>
              <item.icon size={18} />
              {item.path === '/review' && <ReviewBadge pending={reviewPending} count={unfinished} compact />}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex w-full flex-col items-center gap-2 border-t border-border pt-3">
          <NavLink to="/settings" aria-label="Settings" title="Settings" className={railLink}>
            <Settings size={18} />
          </NavLink>
          <Link
            to="/settings"
            aria-label={user?.name ? `Open ${user.name}'s profile` : 'Open profile'}
            title={user?.name || 'Caprio user'}
            className="grid h-10 w-10 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <UserAvatar user={user} className="h-8 w-8" fallbackClassName="bg-accent text-xs font-medium text-foreground" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const items = [...NAV_ITEMS, { label: 'Settings', path: '/settings', icon: Settings }];
  const { reviewPath, reviewPending } = useReviewNav();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 flex justify-around py-2 px-1">
      {items.map((item) => {
        const active = location.pathname.startsWith(item.path);
        return (
          <NavLink
            key={item.path}
            to={item.path === '/review' ? reviewPath : item.path}
            className={`relative flex flex-col items-center gap-1 px-2 py-1 text-[11px] ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon size={18} />
            {item.label}
            {item.path === '/review' && reviewPending && <span className="absolute right-1 top-0 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
          </NavLink>
        );
      })}
    </nav>
  );
}
