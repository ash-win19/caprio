import { Page, PageBody, PageHeader } from '@/components/PageLayout';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import { useAuth0 } from '@auth0/auth0-react';
import { clearActiveAccount } from '@/lib/accountSession';
import { useAppStore } from '@/lib/store';
import { UserAvatar } from '@/components/UserAvatar';

export default function SettingsPage() {
  const { user, setUser, resetAccountState } = useAppStore();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth0();

  const handleSignOut = () => {
    const isDemo = localStorage.getItem('caprio_session') === 'demo';

    localStorage.removeItem('caprio_session');
    localStorage.removeItem('demo_user');
    setUser(null);

    if (isAuthenticated && !isDemo) {
      void logout({ logoutParams: { returnTo: window.location.origin } });
      return;
    }

    resetAccountState();
    clearActiveAccount();
    localStorage.removeItem('onboarding_complete');
    localStorage.removeItem('caprio-store');
    navigate('/login');
  };

  return <Page>
    <PageHeader title="Settings" />
    <PageBody width="form">
      <section aria-labelledby="task-settings-heading"><h2 id="task-settings-heading" className="mb-3 text-sm font-medium">Task organization</h2><Link to="/settings/categories" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 hover:bg-accent"><div><p className="text-base font-medium">Categories</p><p className="mt-1 text-sm text-muted-foreground">Organize tasks and add context for planning.</p></div><ChevronRight size={18} className="shrink-0 text-muted-foreground" /></Link></section>
      <section aria-labelledby="account-heading" className="mt-8"><h2 id="account-heading" className="mb-3 text-sm font-medium">Account</h2><div className="flex min-w-0 items-center gap-3"><UserAvatar user={user} className="h-10 w-10 shrink-0" fallbackClassName="bg-accent text-xs font-medium text-foreground" /><div className="min-w-0"><p className="break-words text-sm">{user?.name || 'Caprio user'}</p>{user?.email && <p className="break-all text-xs text-muted-foreground">{user.email}</p>}</div></div><button onClick={handleSignOut} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"><LogOut size={15} />Sign out</button></section>
      <details className="workspace-details mt-6 border-t border-border pt-4"><summary>Help and input<ChevronDown size={15} aria-hidden /></summary><div className="mt-2 flex flex-col items-start"><Link to="/settings/voice" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Shortcuts and input</Link><Link to="/settings/notifications" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">How planning works</Link></div></details>
    </PageBody>
  </Page>;
}
