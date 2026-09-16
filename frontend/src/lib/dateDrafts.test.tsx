import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { activateAccount, clearActiveAccount } from './accountSession';
import { clearDateDrafts, useDateDraft, useNavigationLock, useNavigationState } from './dateDrafts';

beforeEach(() => { localStorage.clear(); clearDateDrafts(); });

describe('account-scoped session drafts', () => {
  it('keeps navigation locked while either the checklist or conversation is saving', () => {
    const list = renderHook(({ busy }) => useNavigationLock(busy), { initialProps: { busy: true } });
    const chat = renderHook(({ busy }) => useNavigationLock(busy), { initialProps: { busy: false } });
    expect(useNavigationState.getState().locked).toBe(true);
    chat.rerender({ busy: true });
    list.rerender({ busy: false });
    expect(useNavigationState.getState().locked).toBe(true);
    list.unmount();
    expect(useNavigationState.getState().locked).toBe(true);
    chat.rerender({ busy: false });
    expect(useNavigationState.getState().locked).toBe(false);
    chat.unmount();
  });
  it('restores a draft when navigating back to its day without persisting it to storage', () => {
    activateAccount('first');
    const first = renderHook(() => useDateDraft('composer', '2026-09-15', ''));
    act(() => first.result.current[1]('Private planning notes'));
    first.unmount();
    const tomorrow = renderHook(() => useDateDraft('composer', '2026-09-16', ''));
    expect(tomorrow.result.current[0]).toBe('');
    tomorrow.unmount();
    const restored = renderHook(() => useDateDraft('composer', '2026-09-15', ''));
    expect(restored.result.current[0]).toBe('Private planning notes');
    expect(JSON.stringify(localStorage)).not.toContain('Private planning notes');
  });

  it('clears drafts on account changes and rejects late updates from the previous account', () => {
    activateAccount('first');
    const old = renderHook(() => useDateDraft('composer', '2026-09-15', ''));
    act(() => old.result.current[1]('First account notes'));
    const lateUpdate = old.result.current[1];
    old.unmount();
    activateAccount('second');
    act(() => lateUpdate('Late first-account response'));
    const next = renderHook(() => useDateDraft('composer', '2026-09-15', ''));
    expect(next.result.current[0]).toBe('');
    act(() => next.result.current[1]('Second account notes'));
    next.unmount();
    clearActiveAccount();
    const loggedOut = renderHook(() => useDateDraft('composer', '2026-09-15', ''));
    expect(loggedOut.result.current[0]).toBe('');
  });
});
