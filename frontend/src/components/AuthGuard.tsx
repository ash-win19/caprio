import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activateAccount } from '@/lib/accountSession';
import { useAppStore } from '@/lib/store';
import { bootstrap, setAccessTokenProvider } from '@/lib/api';
import { localDate } from '@/lib/date';
import { QUERY_KEYS } from '@/lib/queries';

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/landing'];

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, user, getAccessTokenSilently, loginWithRedirect } = useAuth0();
  const location = useLocation();
  const client = useQueryClient();
  const isDemo = (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true') && localStorage.getItem('caprio_session') === 'demo';
  const account = isAuthenticated && user?.sub ? user.sub : isDemo ? 'demo' : null;
  const [preparedAccount, setPreparedAccount] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const previousAccount = useRef<string | null>(null);
  const date = localDate();

  useLayoutEffect(() => {
    if (previousAccount.current !== account) {
      client.clear();
      previousAccount.current = account;
    }
    if (!account) {
      setPreparedAccount(null);
      return setAccessTokenProvider(null);
    }
    activateAccount(account);
    const cleanup = setAccessTokenProvider(account === 'demo' ? null : () => getAccessTokenSilently());
    setPreparedAccount(account);
    setSessionExpired(false);
    return cleanup;
  }, [account, client, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated || !user?.sub || preparedAccount !== user.sub) return;
    localStorage.removeItem('caprio_session');
    localStorage.removeItem('demo_user');
    const current = useAppStore.getState().user;
    const next = {
      name: user.name || user.nickname || user.email || 'Caprio user',
      email: user.email || '',
      picture: user.picture,
      categories: current?.categories || [],
    };
    if (current?.name !== next.name || current?.email !== next.email || current?.picture !== next.picture) {
      useAppStore.getState().setUser(next);
    }
  }, [isAuthenticated, preparedAccount, user]);

  useEffect(() => {
    const expired = () => setSessionExpired(true);
    window.addEventListener('caprio:session-expired', expired);
    return () => window.removeEventListener('caprio:session-expired', expired);
  }, []);

  const session = useQuery({
    queryKey: [...QUERY_KEYS.bootstrap, date],
    queryFn: () => bootstrap(date),
    enabled: Boolean(account && preparedAccount === account),
    retry: 1,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!session.data || !account || preparedAccount !== account) return;
    const { categories, preferences, onboardingComplete } = session.data;
    useAppStore.getState().setCategories(categories);
    useAppStore.getState().setPrefs(preferences);
    if (onboardingComplete) localStorage.setItem('onboarding_complete', 'true');
    else localStorage.removeItem('onboarding_complete');
  }, [account, preparedAccount, session.data]);

  if (isLoading && !isDemo) return <SessionStatus>Loading your account...</SessionStatus>;
  if (!account) return PUBLIC_ROUTES.includes(location.pathname) ? <>{children}</> : <Navigate to="/login" replace />;
  if (preparedAccount !== account || session.isPending) return <SessionStatus>Loading your day...</SessionStatus>;
  if (session.error || sessionExpired) {
    return (
      <SessionStatus>
        <p role="alert">{sessionExpired ? 'Your session expired. Sign in again to continue.' : session.error?.message || 'Unable to load your account.'}</p>
        <div className="mt-4 flex justify-center gap-4">
          <button className="underline" onClick={() => { setSessionExpired(false); void session.refetch(); }}>Try again</button>
          {!isDemo && <button className="underline" onClick={() => void loginWithRedirect({ appState: { returnTo: location.pathname + location.search } })}>Sign in again</button>}
        </div>
      </SessionStatus>
    );
  }
  if (!session.data.onboardingComplete && !location.pathname.startsWith('/onboarding')) return <Navigate to="/onboarding" replace />;
  if (session.data.onboardingComplete && (PUBLIC_ROUTES.includes(location.pathname) || location.pathname.startsWith('/onboarding'))) {
    return <Navigate to={session.data.todayTasks?.length ? '/today' : '/new'} replace />;
  }
  return <>{children}</>;
}

function SessionStatus({ children }: { children: ReactNode }) {
  return <div className="min-h-screen grid place-items-center bg-background p-6 text-center text-sm text-muted-foreground"><div>{children}</div></div>;
}
