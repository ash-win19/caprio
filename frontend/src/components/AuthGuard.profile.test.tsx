import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthGuard } from './AuthGuard';
import { useAppStore } from '@/lib/store';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  user: {
    sub: 'google-oauth2|user-a',
    name: 'User A',
    email: 'a@example.com',
    picture: undefined as string | undefined,
  },
}));

vi.mock('@auth0/auth0-react', () => ({ useAuth0: () => auth }));

vi.mock('@/lib/api', async (load) => {
  const original = await load<typeof import('@/lib/api')>();
  return {
    ...original,
    bootstrap: vi.fn(async () => ({
      user: { id: 'user-a', name: 'User A', email: 'a@example.com' },
      onboardingComplete: true,
      preferences: useAppStore.getState().prefs,
      categories: useAppStore.getState().categories,
      todayTasks: [],
      backlog: [],
      streak: 0,
    })),
    setAccessTokenProvider: vi.fn(() => vi.fn()),
  };
});

function renderGuard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/new']}><AuthGuard><div>Conversation</div></AuthGuard></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AuthGuard profile sync', () => {
  beforeEach(() => {
    useAppStore.getState().resetAccountState();
    localStorage.clear();
    localStorage.setItem('caprio_active_account', auth.user.sub);
    localStorage.setItem('onboarding_complete', 'true');
  });

  it.each([
    { label: 'adds the Google photo for an existing user', previous: undefined, next: 'https://example.com/google-photo.png' },
    { label: 'updates a changed photo without a name or email change', previous: 'https://example.com/old.png', next: 'https://example.com/new.png' },
    { label: 'clears a photo that Auth0 no longer supplies', previous: 'https://example.com/old.png', next: undefined },
  ])('$label', async ({ previous, next }) => {
    const existingUser = { name: auth.user.name, email: auth.user.email, categories: ['Work'], picture: previous };
    useAppStore.getState().setUser(existingUser);
    auth.user = { ...auth.user, picture: next };

    renderGuard();

    await waitFor(() => expect(useAppStore.getState().user).toEqual({ ...existingUser, picture: next }));
  });

  it('does not retain another account’s photo or preferences', async () => {
    localStorage.setItem('caprio_active_account', 'google-oauth2|previous-user');
    const previousUser = { name: 'Previous user', email: 'previous@example.com', categories: ['Work'], picture: 'https://example.com/previous.png' };
    useAppStore.getState().setUser(previousUser);
    auth.user = { ...auth.user, picture: 'https://example.com/current.png' };

    renderGuard();

    await waitFor(() => expect(useAppStore.getState().user).toEqual({ name: auth.user.name, email: auth.user.email, categories: [], picture: auth.user.picture }));
  });
});
