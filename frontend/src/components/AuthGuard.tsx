import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activateAccount } from '@/lib/accountSession';
import { useAppStore } from '@/lib/store';
import { bootstrap, rolloverDay, setAccessTokenProvider } from '@/lib/api';
import { useLocalDay } from '@/lib/useLocalDay';
import { isValidDate } from '@/lib/date';
import { hasOpenedDay, markDayOpened } from '@/lib/dayEntry';
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
        await Promise.all([QUERY_KEYS.tasks, QUERY_KEYS.sessions].map(queryKey => client.invalidateQueries({ queryKey })));
      }
      return bootstrap(date);
    },
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

  useEffect(() => {
    const explicitDate = new URLSearchParams(location.search).get('date');
    if (account && preparedAccount === account && session.data?.onboardingComplete
      && location.pathname === '/new' && (!explicitDate || !isValidDate(explicitDate) || explicitDate === date)) {
      markDayOpened(account, date);
    }
  }, [account, preparedAccount, session.data, location.pathname, location.search, date]);

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

  if (session.data.onboardingComplete && location.pathname.startsWith('/onboarding')) return <Navigate to="/new" replace />;
  const fromPublicRoute = PUBLIC_ROUTES.includes(location.pathname);
  // Missing or invalid dates open the current day, matching Today's fallback.
  // Valid explicit dates, including View tasks links, keep their destination.
  const explicitDate = new URLSearchParams(location.search).get('date');
  const opensCurrentDay = location.pathname === '/today' && (!explicitDate || !isValidDate(explicitDate));
  if (fromPublicRoute || opensCurrentDay) return <DayEntry key={`${account}:${date}`} account={account} date={date} fromPublicRoute={fromPublicRoute} savedPlanDate={location.state?.savedPlanDate}>{children}</DayEntry>;

  return <>{children}</>;
}

function DayEntry({ account, date, fromPublicRoute, savedPlanDate, children }: { account: string; date: string; fromPublicRoute: boolean; savedPlanDate?: string; children: ReactNode }) {
  // AuthGuard mounts this only after rollover and account bootstrap finish.
  // Carried tasks do not mean the user has started today's plan.
  const workflow = useWorkflow(date);
  const [firstOpen] = useState(() => !hasOpenedDay(account, date));
  useEffect(() => {
    if (workflow.isSuccess) markDayOpened(account, date);
  }, [account, date, workflow.isSuccess]);
  if (workflow.isPending) return <SessionStatus>Loading your day...</SessionStatus>;
  if (workflow.error) return <SessionStatus>
    <p role="alert">{workflow.error.message || 'Unable to load your day.'}</p>
    <button className="mt-4 underline" onClick={() => void workflow.refetch()}>Try again</button>
  </SessionStatus>;
  const hasNewTasks = workflow.data.tasks.some(task => task.deferCount === 0);
  // A just-saved plan can contain only carried tasks. Keep its task page open
  // without pinning the route to a date, so an overnight tab starts tomorrow.
  const showsSavedPlan = savedPlanDate === date && workflow.data.state === 'active' && workflow.data.tasks.length > 0;
  if (!showsSavedPlan && workflow.data.state !== 'closed' && (firstOpen || workflow.data.state === 'planning' || !hasNewTasks)) return <Navigate to="/new" state={{ planningDay: date }} replace />;
  if (fromPublicRoute) return <Navigate to="/today" replace />;
  return <>{children}</>;
}

function SessionStatus({ children }: { children: ReactNode }) {
  return <div className="min-h-screen grid place-items-center bg-background p-6 text-center text-sm text-muted-foreground"><div>{children}</div></div>;
}
