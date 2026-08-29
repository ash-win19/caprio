import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskChange, Category, UserPrefs, VoiceState, VoiceEntry } from './types';
import { DEFAULT_CATEGORIES } from './types';

const MOCK_VOICE_ENTRIES: VoiceEntry[] = [
  { id: 'v1', transcript: 'Just got pulled into a 3-hour client issue, gym is off the table today', timestamp: '2h ago' },
  { id: 'v2', transcript: 'API deadline moved to tomorrow morning', timestamp: 'Yesterday' },
  { id: 'v3', transcript: 'Only have 2 hours before my flight leaves', timestamp: '2 days ago' },
];

const DEFAULT_PREFS: UserPrefs = {
  briefTime: '08:00',
  nudgeFrequency: 'regular',
  proactiveReprioritization: true,
  eodReminder: true,
  eodTime: '21:00',
  micSensitivity: 50,
  language: 'en-US',
  saveTranscripts: true,
};

interface AppState {
  user: { name: string; email: string; categories: string[] } | null;
  tasks: Task[];
  capturePool: Task[];
  carriedOver: Task[];
  voiceState: VoiceState;
  lastPrioritization: { timestamp: number; changes: TaskChange[]; previousTasks: unknown[] } | null;
  categories: Category[];
  prefs: UserPrefs;
  voiceEntries: VoiceEntry[];
  streak: number;

  setUser: (user: AppState['user']) => void;
  setTasks: (tasks: Task[]) => void;
  toggleTask: (id: string) => void;
  addTaskToToday: (task: Task) => void;
  removeTask: (id: string) => void;
  addToCapturePool: (task: Task) => void;
  removeFromCapturePool: (id: string) => void;
  setVoiceState: (state: VoiceState) => void;
  applyPrioritization: (tasks: unknown[], changes: TaskChange[]) => void;
  undoPrioritization: () => void;
  clearPrioritizationHistory: () => void;
  setCategories: (cats: Category[]) => void;
  setPrefs: (prefs: Partial<UserPrefs>) => void;
  addVoiceEntry: (entry: VoiceEntry) => void;
  removeVoiceEntry: (id: string) => void;
  clearVoiceEntries: () => void;
  initializeMockData: () => void;
  resetAccountState: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      tasks: [],
      capturePool: [],
      carriedOver: [],
      voiceState: 'idle',
      lastPrioritization: null,
      categories: DEFAULT_CATEGORIES,
      prefs: DEFAULT_PREFS,
      voiceEntries: MOCK_VOICE_ENTRIES,
      streak: 4,

      setUser: (user) => set({ user }),
      setTasks: (tasks) => set({ tasks }),
      toggleTask: (id) => set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, completed: !t.completed } : t) })),
      addTaskToToday: (task) => set((s) => ({ tasks: [...s.tasks, { ...task, addedToday: true, order: s.tasks.length }] })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      addToCapturePool: (task) => set((s) => ({ capturePool: [...s.capturePool, task] })),
      removeFromCapturePool: (id) => set((s) => ({ capturePool: s.capturePool.filter((t) => t.id !== id) })),
      setVoiceState: (voiceState) => set({ voiceState }),
      applyPrioritization: (tasks, changes) => set(() => ({
        lastPrioritization: { timestamp: Date.now(), changes, previousTasks: tasks },
      })),
      undoPrioritization: () => set({ lastPrioritization: null }),
      clearPrioritizationHistory: () => set({ lastPrioritization: null }),
      setCategories: (categories) => set({ categories }),
      setPrefs: (prefs) => set((s) => ({ prefs: { ...s.prefs, ...prefs } })),
      addVoiceEntry: (entry) => set((s) => ({ voiceEntries: [entry, ...s.voiceEntries] })),
      removeVoiceEntry: (id) => set((s) => ({ voiceEntries: s.voiceEntries.filter((e) => e.id !== id) })),
      clearVoiceEntries: () => set({ voiceEntries: [] }),
      initializeMockData: () => {
        // No-op: GrillMe pages (/new and /today) use React Query, not mock data
        // Old pages (Capture, Review, etc.) can still use store but won't auto-seed
      },
      resetAccountState: () => set({
        user: null,
        tasks: [],
        capturePool: [],
        carriedOver: [],
        voiceState: 'idle',
        lastPrioritization: null,
        categories: DEFAULT_CATEGORIES,
        prefs: DEFAULT_PREFS,
        voiceEntries: MOCK_VOICE_ENTRIES,
        streak: 4,
      }),
    }),
    { name: 'caprio-store' }
  )
);
