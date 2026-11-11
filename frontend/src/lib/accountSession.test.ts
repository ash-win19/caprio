import { beforeEach, describe, expect, it } from 'vitest';
import { activateAccount } from './accountSession';
import { useAppStore } from './store';

describe('activateAccount', () => {
  beforeEach(() => {
    useAppStore.getState().resetAccountState();
    localStorage.clear();
  });

  it('preserves state for the same account', () => {
    localStorage.setItem('caprio_active_account', 'auth0|user-a');
    const user = { name: 'User A', email: 'a@example.com', categories: ['Work'] };
    useAppStore.getState().setUser(user);

    activateAccount('auth0|user-a');

    expect(useAppStore.getState().user).toEqual(user);
  });

  it('clears account state when the account changes', () => {
    localStorage.setItem('caprio_active_account', 'auth0|user-a');
    useAppStore.setState({ user: { name: 'User A', email: 'a@example.com', categories: ['Work'] } });

    activateAccount('auth0|user-b');

    expect(useAppStore.getState().user).toBeNull();
    expect(localStorage.getItem('caprio_active_account')).toBe('auth0|user-b');
  });
});
