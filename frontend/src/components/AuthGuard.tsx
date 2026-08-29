import { ReactNode, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useAppStore } from '@/lib/store';

const PUBLIC_ROUTES = ['/', '/login', '/signup'];

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth0();
  const setUser = useAppStore((state) => state.setUser);
  const initializeMockData = useAppStore((state) => state.initializeMockData);
  const isDemo = localStorage.getItem('caprio_session') === 'demo';

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    localStorage.removeItem('caprio_session');
    localStorage.removeItem('demo_user');

    const currentUser = useAppStore.getState().user;
    const nextUser = {
      name: user.name || user.nickname || user.email || 'Caprio user',
      email: user.email || '',
      categories: currentUser?.categories || [],
    };

    if (currentUser?.name !== nextUser.name || currentUser?.email !== nextUser.email) {
      setUser(nextUser);
    }
    initializeMockData();
  }, [initializeMockData, isAuthenticated, setUser, user]);

  useEffect(() => {
    if (isLoading && !isDemo) return;

    const hasSession = isDemo || isAuthenticated;
    const onboarded = localStorage.getItem('onboarding_complete');
    const isPublic = PUBLIC_ROUTES.includes(location.pathname);

    if (!hasSession && !isPublic) {
      navigate('/login', { replace: true });
    } else if (hasSession && !onboarded && !location.pathname.startsWith('/onboarding')) {
      navigate('/onboarding', { replace: true });
    } else if (hasSession && onboarded && (location.pathname === '/login' || location.pathname === '/signup')) {
      navigate('/today', { replace: true });
    }
  }, [isAuthenticated, isDemo, isLoading, location.pathname, navigate]);

  if (isLoading && !isDemo) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground">
        Loading Caprio...
      </div>
    );
  }

  return <>{children}</>;
}
