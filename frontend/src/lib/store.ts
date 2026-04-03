import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task, TaskChange, Category, UserPrefs, VoiceState, VoiceEntry } from './types';
import { DEFAULT_CATEGORIES } from './types';

const MOCK_TODAY_TASKS: Task[] = [
  { id: 't1', title: 'Review API integration docs', category: 'Work', urgency: 'high', duration: 45, completed: false, addedToday: true, carriedOver: false, order: 0 },
  { id: 't2', title: 'Reply to client email', category: 'Work', urgency: 'medium', duration: 10, completed: false, addedToday: true, carriedOver: false, order: 1 },
  { id: 't3', title: 'Morning run', category: 'Gym', urgency: 'low', duration: 30, completed: false, addedToday: true, carriedOver: false, order: 2 },
  { id: 't4', title: 'Read 20 pages', category: 'Personal Growth', urgency: 'low', duration: 25, completed: false, addedToday: true, carriedOver: false, order: 3 },
  { id: 't5', title: 'Team standup', category: 'Work', urgency: 'high', duration: 15, completed: false, addedToday: true, carriedOver: false, order: 4 },
  { id: 't6', title: 'Review monthly budget', category: 'Finance', urgency: 'medium', duration: 15, completed: false, addedToday: true, carriedOver: false, order: 5 },
];

const MOCK_CAPTURE_TASKS: Task[] = [
  ...MOCK_TODAY_TASKS,
  { id: 'c1', title: 'Plan weekend trip', category: 'Social', urgency: 'low', duration: 20, completed: false, addedToday: false, carriedOver: false, order: 6 },
  { id: 'c2', title: 'Update resume', category: 'Personal Growth', urgency: 'medium', duration: 60, completed: false, addedToday: false, carriedOver: false, order: 7 },
  { id: 'c3', title: 'Grocery shopping', category: 'Health', urgency: 'medium', duration: 45, source: 'idea', completed: false, addedToday: false, carriedOver: false, order: 8 },
  { id: 'c4', title: 'Call mom', category: 'Family', urgency: 'low', duration: 15, completed: false, addedToday: false, carriedOver: false, order: 9 },
  { id: 'c5', title: 'Research investment options', category: 'Finance', urgency: 'low', duration: 30, source: 'Slack', completed: false, addedToday: false, carriedOver: false, order: 10 },
  { id: 'c6', title: 'Complete online course module', category: 'Learning', urgency: 'medium', duration: 45, completed: false, addedToday: false, carriedOver: false, order: 11 },
];

const MOCK_CARRIED_OVER: Task[] = [
  { id: 'co1', title: 'Write project proposal', category: 'Work', urgency: 'high', duration: 60, completed: false, addedToday: false, carriedOver: true, order: 12 },
  { id: 'co2', title: 'Stretch routine', category: 'Gym', urgency: 'low', duration: 15, completed: false, addedToday: false, carriedOver: true, order: 13 },
];

const MOCK_VOICE_ENTRIES: VoiceEntry[] = [
  { id: 'v1', transcript: 'Just got pulled into a 3-hour client issue, gym is off the table today', timestamp: '2h ago' },
  { id: 'v2', transcript: 'API deadline moved to tomorrow morning', timestamp: 'Yesterday' },
  { id: 'v3', transcript: 'Only have 2 hours before my flight leaves', timestamp: '2 days ago' },
];

interface AppState {
  user: { name: string; email: string; categories: string[] } | null;
  tasks: Task[];
  capturePool: Task[];
  carriedOver: Task[];
  voiceState: VoiceState;
  lastPrioritization: { timestamp: number; changes: TaskChange[]; previousTasks: Task[] } | null;
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
  applyPrioritization: (tasks: Task[], changes: TaskChange[]) => void;
  undoPrioritization: () => void;
  setCategories: (cats: Category[]) => void;
  setPrefs: (prefs: Partial<UserPrefs>) => void;
  addVoiceEntry: (entry: VoiceEntry) => void;
  removeVoiceEntry: (id: string) => void;
  clearVoiceEntries: () => void;
  initializeMockData: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      tasks: [],
      capturePool: [],
      carriedOver: [],
      voiceState: 'idle',
      lastPrioritization: null,
      categories: DEFAULT_CATEGORIES,
      prefs: {
        briefTime: '08:00',
        nudgeFrequency: 'regular',
        proactiveReprioritization: true,
        eodReminder: true,
        eodTime: '21:00',
        micSensitivity: 50,
        language: 'en-US',
        saveTranscripts: true,
      },
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
      applyPrioritization: (tasks, changes) => set((s) => ({
        tasks,
        lastPrioritization: { timestamp: Date.now(), changes, previousTasks: s.tasks },
      })),
      undoPrioritization: () => set((s) => {
        if (!s.lastPrioritization) return {};
        return { tasks: s.lastPrioritization.previousTasks, lastPrioritization: null };
      }),
      setCategories: (categories) => set({ categories }),
      setPrefs: (prefs) => set((s) => ({ prefs: { ...s.prefs, ...prefs } })),
      addVoiceEntry: (entry) => set((s) => ({ voiceEntries: [entry, ...s.voiceEntries] })),
      removeVoiceEntry: (id) => set((s) => ({ voiceEntries: s.voiceEntries.filter((e) => e.id !== id) })),
      clearVoiceEntries: () => set({ voiceEntries: [] }),
      initializeMockData: () => {
        const state = get();
        if (state.tasks.length === 0) {
          set({
            tasks: MOCK_TODAY_TASKS,
            capturePool: MOCK_CAPTURE_TASKS,
            carriedOver: MOCK_CARRIED_OVER,
          });
        }
      },
    }),
    { name: 'caprio-store' }
  )
);
