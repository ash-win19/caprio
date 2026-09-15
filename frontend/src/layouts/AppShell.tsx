import { useState, type ReactNode } from 'react';
import { History, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { AppSidebar, MobileBottomNav } from '@/components/AppSidebar';
import { TopBarHost } from '@/lib/topbar';
import { CONTENT_OFFSET_CLASS, sidebarShortcutLabel, useSidebarStore } from '@/lib/sidebar';
import { useNavigationState } from '@/lib/dateDrafts';
import { toast } from '@/hooks/use-toast';

export function AppShell({ children, sidebar, conversation = false, onOpenConversations }: { children: ReactNode; sidebar?: ReactNode; conversation?: boolean; onOpenConversations?: () => void }) {
  const collapsed = useSidebarStore(s => s.collapsed);
  const toggle = useSidebarStore(s => s.toggle);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <TopBarHost.Provider value={host}>
    <div className="min-h-screen bg-background" onClickCapture={event => {
      if (useNavigationState.getState().locked && (event.target as HTMLElement).closest('a[href]:not([href^="#"])')) {
        event.preventDefault();
        event.stopPropagation();
        toast({ title: 'Finish the current action first', description: 'Wait for saving to finish, or stop the reply before switching pages.' });
      }
    }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      {sidebar ?? <AppSidebar externalToggle />}
      <div className={`app-workspace ${conversation ? 'conversation-workspace' : ''} ${collapsed ? CONTENT_OFFSET_CLASS.collapsed : CONTENT_OFFSET_CLASS.expanded}`}>
        <header className="app-topbar" aria-label="Page context">
          <button id="sidebar-toggle" type="button" className="topbar-toggle" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls={conversation ? 'conversation-sidebar' : 'app-sidebar'} aria-keyshortcuts="Meta+B Control+B" title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${sidebarShortcutLabel()})`}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          {onOpenConversations && <button id="conversation-history-trigger" type="button" className="topbar-mobile-menu md:hidden" onClick={onOpenConversations} aria-label="Open conversation history"><History size={18} /></button>}
          <div ref={setHost} className="contents" />
        </header>
        {children}
      </div>
      <MobileBottomNav />
    </div>
  </TopBarHost.Provider>;
}
