import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activateAccount } from '@/lib/accountSession';
import { useAppStore } from '@/lib/store';
import { bootstrap, rolloverDay, setAccessTokenProvider } from '@/lib/api';
import { useLocalDay } from '@/lib/useLocalDay';
import { hasSkippedDay, isConfirmed, markDaySkipped, opensToday } from '@/lib/dayEntry';
import { clearDateDrafts } from '@/lib/dateDrafts';
import { QUERY_KEYS, useWorkflow } from '@/lib/queries';

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
  const date = useLocalDay();

  useLayoutEffect(() => {
    if (previousAccount.current !== account) {
      client.clear();
      clearDateDrafts();
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
    queryFn: async ({ signal }) => {
      const rolledOver = await rolloverDay(signal);
      if (signal.aborted) throw new DOMException('The account session changed.', 'AbortError');
      if (rolledOver) {
        client.setQueryData([...QUERY_KEYS.workflow, rolledOver.date], rolledOver);
        await Promise.all([QUERY_KEYS.tasks, QUERY_KEYS.history].map(queryKey => client.invalidateQueries({ queryKey })));
      }
      return bootstrap(date);
    },
    enabled: Boolean(account && preparedAccount === account),
    retry: 1,
    staleTime: 60_000,
  });


  useEffect(() => {
    if (!session.data || !account || preparedAccount !== account) return;
    const { categories, preferences } = session.data;
    useAppStore.getState().setCategories(categories);
    useAppStore.getState().setPrefs(preferences);
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
  const fromPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  // Today is always the current Day, so every way into it follows the entry rule.
  if (fromPublicRoute || location.pathname === '/today') return <DayEntry key={`${account}:${date}`} account={account} date={date} fromPublicRoute={fromPublicRoute} openedToday={opensToday(location.state, date)}>{children}</DayEntry>;

  return <>{children}</>;
}

function DayEntry({ account, date, fromPublicRoute, openedToday, children }: { account: string; date: string; fromPublicRoute: boolean; openedToday: boolean; children: ReactNode }) {
  // AuthGuard mounts this only after rollover and account bootstrap finish.
  // A Day that isn't confirmed opens in the Conversation until the person
  // skips it on this device; choosing Today counts as skipping.
  const workflow = useWorkflow(date);
  // Read at render, so a skip saved while the day loads (say, in another tab) counts.
  const showsToday = openedToday || hasSkippedDay(account, date) || isConfirmed(workflow.data);
  useEffect(() => {
    if (openedToday) markDaySkipped(account, date);
  }, [account, date, openedToday]);
  // A cached day may have been confirmed since; only a fresh one can send
  // the person to the Conversation. A confirmed day never goes back to planning.
  if (workflow.isPending || (!showsToday && workflow.isFetching)) return <SessionStatus>Loading your day...</SessionStatus>;
  if (workflow.error) return <SessionStatus>
    <p role="alert">{workflow.error.message || 'Unable to load your day.'}</p>
    <button className="mt-4 underline" onClick={() => void workflow.refetch()}>Try again</button>
  </SessionStatus>;
  if (!showsToday) return <Navigate to="/conversation" replace />;
  if (fromPublicRoute) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

function SessionStatus({ children }: { children: ReactNode }) {
  return <div className="min-h-screen grid place-items-center bg-background p-6 text-center text-sm text-muted-foreground"><div>{children}</div></div>;
}
