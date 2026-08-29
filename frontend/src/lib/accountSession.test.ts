import { beforeEach, describe, expect, it } from 'vitest';
import { activateAccount } from './accountSession';
import { useAppStore } from './store';

const privateTask = {
  id: 'private-task',
  title: 'Private task',
  category: 'Work',
  urgency: 'high' as const,
  duration: 30,
  completed: false,
  addedToday: true,
  carriedOver: false,
  order: 0,
};

describe('activateAccount', () => {
  beforeEach(() => {
    useAppStore.getState().resetAccountState();
    localStorage.clear();
  });

  it('preserves state for the same account', () => {
    localStorage.setItem('caprio_active_account', 'auth0|user-a');
    localStorage.setItem('onboarding_complete', 'true');
    useAppStore.getState().setTasks([privateTask]);

    activateAccount('auth0|user-a');

    expect(useAppStore.getState().tasks).toEqual([privateTask]);
    expect(localStorage.getItem('onboarding_complete')).toBe('true');
  });

  it('clears account state when the account changes', () => {
    localStorage.setItem('caprio_active_account', 'auth0|user-a');
    localStorage.setItem('onboarding_complete', 'true');
    useAppStore.setState({
      user: { name: 'User A', email: 'a@example.com', categories: ['Work'] },
      tasks: [privateTask],
      voiceEntries: [{ id: 'private-entry', transcript: 'Private note', timestamp: 'now' }],
    });

    activateAccount('auth0|user-b');

    const state = useAppStore.getState();
    expect(state.user).toBeNull();
    expect(state.tasks).toEqual([]);
    expect(state.voiceEntries).not.toContainEqual(expect.objectContaining({ id: 'private-entry' }));
    expect(localStorage.getItem('onboarding_complete')).toBeNull();
    expect(localStorage.getItem('caprio_active_account')).toBe('auth0|user-b');
  });
});
