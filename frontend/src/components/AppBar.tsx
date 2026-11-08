import { Link, NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navigation';
import { openTodayState } from '@/lib/dayEntry';
import { useAppStore } from '@/lib/store';
import { useLocalDay } from '@/lib/useLocalDay';
import { useSignOut } from '@/lib/hooks/use-sign-out';
import { Logo } from '@/components/Logo';
import { UserAvatar } from '@/components/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The brand, the Today and History tabs, and the account menu. Every link to
// Today counts as choosing Today over the morning Conversation.
export function AppBar() {
  const user = useAppStore((s) => s.user);
  const today = useLocalDay();
  const signOut = useSignOut();
  return <header className="app-bar">
    <Link to="/today" state={openTodayState(today)} aria-label="Caprio, go to Today" className="app-bar-brand"><Logo /></Link>
    <nav aria-label="App" className="app-bar-tabs">
      {NAV_ITEMS.map(item => <NavLink key={item.path} to={item.path} state={item.path === '/today' ? openTodayState(today) : undefined} className="app-bar-tab">{item.label}</NavLink>)}
    </nav>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="app-bar-avatar" aria-label="Account menu">
          <UserAvatar user={user} className="h-8 w-8" fallbackClassName="bg-accent text-xs font-medium text-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{user?.email || user?.name || 'Signed in'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </header>;
}
