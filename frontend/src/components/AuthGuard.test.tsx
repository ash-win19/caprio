import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGuard } from './AuthGuard';
import { useAuth0 } from '@auth0/auth0-react';
import type { Auth0ContextInterface } from '@auth0/auth0-react';
import * as api from '@/lib/api';
import { localDate, nextDate, previousDate } from '@/lib/date';

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  bootstrap: vi.fn(),
  rolloverDay: vi.fn(),
  getWorkflow: vi.fn(),
  setAccessTokenProvider: vi.fn(() => vi.fn()),
}));

vi.mock('@/lib/store', () => ({
  useAppStore: Object.assign(
    vi.fn((selector) => {
      const store = {
        user: null,
        setUser: vi.fn(),
        setCategories: vi.fn(),
        setPrefs: vi.fn(),
        initializeMockData: vi.fn(),
        getState: () => ({
          user: null,
          setUser: vi.fn(),
          setCategories: vi.fn(),
          setPrefs: vi.fn(),
        }),
      };
      return selector ? selector(store) : store;
    }),
    {
      getState: () => ({
        user: null,
        setUser: vi.fn(),
        setCategories: vi.fn(),
        setPrefs: vi.fn(),
      }),
    },
  ),
}));

vi.mock('@/lib/accountSession', () => ({
  activateAccount: vi.fn(),
}));

const prefs = {
  briefTime: '08:00',
  nudgeFrequency: 'light' as const,
  proactiveReprioritization: false,
  eodReminder: false,
  eodTime: '18:00',
  micSensitivity: 50,
  language: 'en',
  saveTranscripts: false,
};

function workflow(date: string, state: 'planning' | 'active' | 'closed' = 'planning'): api.Workflow {
  return { date, state, version: 1, messages: [], proposal: null, availableMinutes: null, tasks: [], backlog: [], review: null };
}

function ReviewDestination() {
  const location = useLocation();
  return <div data-testid="review-page">Review {location.search}</div>;
}

function mount(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AuthGuard>
          <Routes>
            <Route path="/" element={<div data-testid="landing-page">Landing</div>} />
            <Route path="/login" element={<div data-testid="login-page">Login</div>} />
            <Route path="/signup" element={<div data-testid="signup-page">Signup</div>} />
            <Route path="/new" element={<div data-testid="new-page">Plan</div>} />
            <Route path="/today" element={<div data-testid="today-page">Today</div>} />
            <Route path="/review" element={<ReviewDestination />} />
          </Routes>
        </AuthGuard>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should not redirect unauthenticated users from / to /login', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: undefined,
    } as Auth0ContextInterface);

    mount('/');
    await waitFor(() => {
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    }, { timeout: 1000 });
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('should allow unauthenticated users to visit /login', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: undefined,
    } as Auth0ContextInterface);

    mount('/login');
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('should allow unauthenticated users to visit /signup', async () => {
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: undefined,
    } as Auth0ContextInterface);

    mount('/signup');
    await waitFor(() => {
      expect(screen.getByTestId('signup-page')).toBeInTheDocument();
    });
  });
});

describe('AuthGuard morning reopen routing', () => {
  const today = localDate();
  const yesterday = previousDate(today);

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(api.rolloverDay).mockReset();
    vi.mocked(api.getWorkflow).mockImplementation(async (date = today) => workflow(date));
    vi.mocked(useAuth0).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { sub: 'auth0|user', name: 'Ashwin', email: 'a@example.com' },
      getAccessTokenSilently: vi.fn(async () => 'token'),
      loginWithRedirect: vi.fn(),
    } as unknown as Auth0ContextInterface);
    vi.mocked(api.bootstrap).mockResolvedValue({
      user: { id: 'user', name: 'Ashwin', email: 'a@example.com' },
      onboardingComplete: true,
      preferences: prefs,
      categories: [],
      todayTasks: [],
      backlog: [],
      streak: 0,
    });
  });

  it('opens Plan on login even when an older day needs review', async () => {
    vi.mocked(api.getWorkflow).mockImplementation(async (date = today) => ({ ...workflow(date), oldestUnclosedDate: yesterday }));
    mount('/');
    await waitFor(() => expect(screen.getByTestId('new-page')).toBeInTheDocument());
    expect(screen.queryByTestId('review-page')).not.toBeInTheDocument();
  });

  it('opens Plan after setup is complete', async () => {
    mount('/onboarding/prefs');
    expect(await screen.findByTestId('new-page')).toBeInTheDocument();
    expect(screen.queryByTestId('today-page')).not.toBeInTheDocument();
  });

  it('allows deliberate planning with unfinished older days', async () => {
    vi.mocked(api.getWorkflow).mockImplementation(async (date = today) => ({ ...workflow(date), oldestUnclosedDate: yesterday }));
    mount('/new');
    await waitFor(() => expect(screen.getByTestId('new-page')).toBeInTheDocument());
  });

  it('opens Plan before a plan is started', async () => {
    vi.mocked(api.getWorkflow).mockImplementation(async (date = today) => workflow(date, 'planning'));
    mount('/');
    await waitFor(() => expect(screen.getByTestId('new-page')).toBeInTheDocument());
  });

  it.each(['/', '/today'])('opens the conversation for a carry-only morning from %s', async (path) => {
    const carried: api.BackendTask = {
      id: 'carried', userId: 'user', title: 'Finish report', urgency: 'medium', duration: 120,
      source: 'manual', completed: false, sortOrder: 0, plannedForDate: today,
      status: 'planned', deferCount: 1, createdAt: yesterday, updatedAt: today,
    };
    const morning = { ...workflow(today), tasks: [carried], carryoverOrigins: { carried: yesterday } };
    vi.mocked(api.rolloverDay).mockResolvedValue(morning);
    vi.mocked(api.getWorkflow).mockResolvedValue(morning);
    mount(path);
    expect(await screen.findByTestId('new-page')).toBeInTheDocument();
    expect(screen.queryByTestId('today-page')).not.toBeInTheDocument();
  });

  it.each(['active', 'closed'] as const)('opens /today when today is already %s, even with no tasks', async (state) => {
    vi.mocked(api.getWorkflow).mockImplementation(async (date = today) => workflow(date, state));
    mount('/');
    await waitFor(() => expect(screen.getByTestId('today-page')).toBeInTheDocument());
  });

  it('opens Plan from a restored Today tab after a multi-day absence', async () => {
    const missed = previousDate(previousDate(previousDate(today)));
    vi.mocked(api.getWorkflow).mockResolvedValue({ ...workflow(today), oldestUnclosedDate: missed });
    mount('/today');
    expect(await screen.findByTestId('new-page')).toBeInTheDocument();
    expect(screen.queryByTestId('review-page')).not.toBeInTheDocument();
  });

  it('waits for rollover before choosing the morning destination', async () => {
    let finishRollover!: (result: api.Workflow) => void;
    vi.mocked(api.rolloverDay).mockImplementation(() => new Promise(resolve => { finishRollover = resolve; }));
    mount('/today');
    await waitFor(() => expect(api.rolloverDay).toHaveBeenCalled());
    expect(api.getWorkflow).not.toHaveBeenCalled();
    expect(screen.queryByTestId('today-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-page')).not.toBeInTheDocument();
    await act(async () => finishRollover(workflow(today)));
    expect(await screen.findByTestId('new-page')).toBeInTheDocument();
  });

  it('offers retry when the morning state cannot be loaded', async () => {
    vi.mocked(api.getWorkflow).mockRejectedValue(new Error('Workflow unavailable'));
    mount('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Workflow unavailable');
    expect(screen.queryByTestId('today-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-page')).not.toBeInTheDocument();
    vi.mocked(api.getWorkflow).mockResolvedValue(workflow(today));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('new-page')).toBeInTheDocument();
  });

  it.each([yesterday, today, nextDate(today)])('preserves an explicit task view for %s', async (date) => {
    mount(`/today?date=${date}`);
    expect(await screen.findByTestId('today-page')).toBeInTheDocument();
    expect(api.getWorkflow).not.toHaveBeenCalled();
  });

  it('keeps a deliberately selected historical day usable while recovery is unavailable', async () => {
    vi.mocked(api.getWorkflow).mockRejectedValue(new Error('Workflow unavailable'));
    mount(`/today?date=${yesterday}`);
    expect(await screen.findByTestId('today-page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
