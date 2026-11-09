import { useState, type ReactNode } from 'react';
import { AppBar } from '@/components/AppBar';
import { TopBarHost } from '@/lib/topbar';
import { useNavigationState } from '@/lib/dateDrafts';
import { toast } from '@/hooks/use-toast';

export function AppShell({ children, conversation = false }: { children: ReactNode; conversation?: boolean }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return <TopBarHost.Provider value={host}>
    <div className={`app-frame bg-background ${conversation ? 'conversation-frame' : ''}`} onClickCapture={event => {
      if (useNavigationState.getState().locked && (event.target as HTMLElement).closest('a[href]:not([href^="#"])')) {
        event.preventDefault();
        event.stopPropagation();
        toast({ title: 'Finish the current action first', description: 'Wait for saving to finish, or stop the reply before switching pages.' });
      }
    }}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <AppBar />
      <div className={`app-workspace ${conversation ? 'conversation-workspace' : ''}`}>
        <header className="app-topbar" aria-label="Page context">
          <div ref={setHost} className="contents" />
        </header>
        {children}
      </div>
    </div>
  </TopBarHost.Provider>;
}
