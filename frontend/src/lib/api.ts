import type { Task, TaskChange, Category, UserPrefs } from './types';
import { useAppStore } from './store';
import { mockPrioritize } from './mockPrioritize';

function delay(ms?: number) {
  return new Promise((r) => setTimeout(r, ms ?? (300 + Math.random() * 500)));
}

export async function getTodayTasks(): Promise<Task[]> {
  await delay();
  return useAppStore.getState().tasks;
}

export async function prioritizeTasks(input: string): Promise<{ tasks: Task[]; changes: TaskChange[] }> {
  const tasks = useAppStore.getState().tasks;
  return mockPrioritize(input, tasks);
}

export async function getCategories(): Promise<Category[]> {
  await delay();
  return useAppStore.getState().categories;
}

export async function updateSettings(prefs: Partial<UserPrefs>): Promise<void> {
  await delay();
  useAppStore.getState().setPrefs(prefs);
}
