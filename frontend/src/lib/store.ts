import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// What the app keeps about the signed-in account between page loads. Tasks
// and Days live in React Query, not here.
interface AppState {
  user: { name: string; email: string; picture?: string; categories: string[] } | null;
  setUser: (user: AppState['user']) => void;
  resetAccountState: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      resetAccountState: () => set({ user: null }),
    }),
    { name: 'caprio-store' }
  )
);
