import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function SettingsPage() {
  const { user } = useAppStore();
  const navigate = useNavigate();

  const handleSignOut = () => {
    localStorage.removeItem('caprio_session');
    localStorage.removeItem('onboarding_complete');
    localStorage.removeItem('demo_user');
    localStorage.removeItem('caprio-store');
    navigate('/login');
  };

  return (
    <div className="max-w-[560px] mx-auto">
      <h1 className="text-heading text-foreground mb-6">Settings</h1>

      <section className="mb-6">
        <p className="text-caption uppercase tracking-wider mb-2">Account</p>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-medium text-foreground">
              {user?.name?.[0] || 'D'}
            </div>
            <div className="flex-1">
              <p className="text-sm text-foreground">{user?.name || 'Demo User'}</p>
              <p className="text-xs text-muted-foreground">{user?.email || 'demo@caprio.app'}</p>
            </div>
          </div>
          <button onClick={handleSignOut}
            className="w-full flex items-center px-4 py-3 text-sm text-cap-red hover:bg-accent transition-colors">
            <LogOut size={14} className="mr-3" />
            Sign out
          </button>
        </div>
      </section>

      <section className="mb-6">
        <p className="text-caption uppercase tracking-wider mb-2">Preferences</p>
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {[
            { label: 'Categories', path: '/settings/categories' },
            { label: 'Notifications', path: '/settings/notifications' },
            { label: 'Voice & shortcuts', path: '/settings/voice' },
          ].map((item, i, arr) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center justify-between px-4 py-3 text-sm text-foreground hover:bg-accent transition-colors ${
                i < arr.length - 1 ? 'border-b border-border' : ''
              }`}
            >
              {item.label}
              <ChevronRight size={14} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>

      <section>
        <p className="text-caption uppercase tracking-wider mb-2">About</p>
        <div className="bg-card border border-border rounded-lg px-4 py-3 flex justify-between text-sm">
          <span className="text-foreground">Version</span>
          <span className="text-mono">Caprio v0.1.0</span>
        </div>
      </section>
    </div>
  );
}
