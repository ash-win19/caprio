import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { activateAccount } from '@/lib/accountSession';
import { useAppStore } from '@/lib/store';
import { api } from '@/lib/api';

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/landing'];

export function AuthGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth0();
  const setUser = useAppStore((state) => state.setUser);
  const initializeMockData = useAppStore((state) => state.initializeMockData);
  const isDemo = localStorage.getItem('caprio_session') === 'demo';
  const [isCheckingDayStatus, setIsCheckingDayStatus] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.sub) return;

    localStorage.removeItem('caprio_session');
    localStorage.removeItem('demo_user');
    activateAccount(user.sub);

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
    } else if (hasSession && onboarded && (location.pathname === '/' || location.pathname === '/landing')) {
      // Redirect authenticated users from landing page to the appropriate app route
      if (!isCheckingDayStatus) {
        setIsCheckingDayStatus(true);
        const today = new Date().toISOString().split('T')[0];
        api.getDayStatus(today)
          .then((status) => {
            if (status.hasTasks) {
              navigate('/today', { replace: true });
            } else {
              navigate('/new', { replace: true });
            }
          })
          .catch(() => {
            // Default to /new on error
            navigate('/new', { replace: true });
          })
          .finally(() => {
            setIsCheckingDayStatus(false);
          });
      }
    }
  }, [isAuthenticated, isDemo, isLoading, location.pathname, navigate, isCheckingDayStatus]);

  if (isLoading && !isDemo) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground">
        Loading Caprio...
      </div>
    );
  }

  if (isCheckingDayStatus) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return <>{children}</>;
}
