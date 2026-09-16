import { useCallback, useEffect, useRef, useState, useId, type SetStateAction } from 'react';
import { create } from 'zustand';

// Session memory only. Clear on account changes; never write private drafts to storage.
const drafts = new Map<string, unknown>();
let epoch = 0;
export function clearDateDrafts() { drafts.clear(); epoch++; }

/** Call from a date-keyed component so browser navigation restores its draft. */
export function useDateDraft<T>(kind: string, date: string, initial: T) {
  const key = `${kind}:${date}`;
  const [value, setValue] = useState<T>(() => drafts.has(key) ? drafts.get(key) as T : initial);
  const current = useRef(value);
  const generation = useRef(epoch);
  const update = useCallback((next: SetStateAction<T>) => {
    const result = typeof next === 'function' ? (next as (value: T) => T)(current.current) : next;
    current.current = result;
    if (generation.current === epoch) drafts.set(key, result);
    setValue(result);
  }, [key]);
  return [value, update] as const;
}

export const useNavigationState = create<{ locked: boolean }>(() => ({ locked: false }));

const navigationLocks = new Map<string, boolean>();
export function useNavigationLock(locked: boolean, hasDraft = false) {
  const id = useId();
  useEffect(() => {
    navigationLocks.set(id, locked);
    const refresh = () => useNavigationState.setState({ locked: [...navigationLocks.values()].some(Boolean) });
    refresh();
    return () => { navigationLocks.delete(id); refresh(); };
  }, [id, locked]);
  useEffect(() => {
    if (!locked && !hasDraft) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [locked, hasDraft]);
}
