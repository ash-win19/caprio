import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Inbox, CheckSquare, History, Settings, MessageSquare } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { UserAvatar } from '@/components/UserAvatar';

const NAV_ITEMS = [
  { label: 'Today', path: '/today', icon: LayoutGrid },
  { label: 'Plan', path: '/new', icon: MessageSquare },
  { label: 'Inbox', path: '/capture', icon: Inbox },
  { label: 'Review', path: '/review', icon: CheckSquare },
  { label: 'History', path: '/momentum', icon: History },
];

export function AppSidebar() {
  const user = useAppStore((s) => s.user);

  return (
    <aside className="hidden md:flex flex-col w-[240px] h-screen fixed left-0 top-0 bg-card border-r border-border z-40">
      <div className="px-5 py-5 flex items-center gap-2">
        <span className="text-[18px] font-semibold text-foreground tracking-tight">Caprio</span>
        <span className="w-2 h-2 rounded-full bg-primary" />
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-accent text-foreground border-l-2 border-primary -ml-[2px]'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`
            }
          >
            <item.icon size={16} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-3 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'
            }`
          }
        >
          <Settings size={16} />
          Settings
        </NavLink>
      </div>

      <div className="border-t border-border px-5 py-3 flex items-center gap-3">
        <UserAvatar user={user} className="h-8 w-8" fallbackClassName="bg-accent text-xs font-medium text-foreground" />
        <span className="text-xs text-muted-foreground truncate">{user?.name || 'Caprio user'}</span>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const location = useLocation();
  const items = [...NAV_ITEMS, { label: 'Settings', path: '/settings', icon: Settings }];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border z-40 flex justify-around py-2 px-1">
      {items.map((item) => {
        const active = location.pathname.startsWith(item.path);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={`flex flex-col items-center gap-1 px-2 py-1 text-[11px] ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
