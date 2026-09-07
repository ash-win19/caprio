import type { Task, TaskChange, Category, UserPrefs } from './types';
import { toast } from '@/hooks/use-toast';
import { localDate } from './date';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8080';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessTokenProvider: (() => Promise<string>) | null = null;

// Auth0 owns token storage and refresh. Keep the API client independent of React.
export function setAccessTokenProvider(provider: (() => Promise<string>) | null) {
  accessTokenProvider = provider;
  return () => {
    if (accessTokenProvider === provider) accessTokenProvider = null;
  };
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = accessTokenProvider ? await accessTokenProvider() : null;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    window.dispatchEvent(new Event('caprio:session-expired'));
    throw new ApiError(401, 'Your session expired. Sign in again to continue.');
  }

  if (response.status >= 500) {
    toast({
      title: 'Server Error',
      description: 'Something went wrong on our end. Please try again later.',
      variant: 'destructive',
    });
    throw new ApiError(response.status, 'Internal server error');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(response.status, errorData.error || 'Request failed');
  }

  return response;
}

// Persisted daily conversations and proposals
export interface ChatSession {
  sessionDate: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface DayStatus {
  date: string;
  hasTasks: boolean;
  taskCount: number;
}

// Task types
export interface BackendTask {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  categoryId?: string | null;
  urgency: 'low' | 'medium' | 'high';
  duration?: number | null;
  source: string;
  completed: boolean;
  sortOrder: number;
  plannedForDate: string;
  status: string;
  priorityReason?: string | null;
  deferCount: number;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackendCategory {
  id: string;
  userId: string;
  name: string;
  color: string;
  hoursPerWeek?: number | null;
  createdAt: string;
}

export interface BootstrapResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  onboardingComplete: boolean;
  preferences: UserPrefs;
  categories: Category[];
  todayTasks: BackendTask[];
  backlog: BackendTask[];
  streak: number;
}

export function mapBackendTaskToTask(backendTask: BackendTask, categories: Category[] = []): Task {
  return {
    id: backendTask.id,
    title: backendTask.title,
    categoryId: backendTask.categoryId || undefined,
    category: categories.find((category) => category.id === backendTask.categoryId)?.name || 'Uncategorized',
    urgency: backendTask.urgency,
    duration: backendTask.duration || undefined,
    source: backendTask.source,
    completed: backendTask.completed || backendTask.status === 'completed',
    plannedForDate: backendTask.plannedForDate,
    status: backendTask.status,
    priorityReason: backendTask.priorityReason || undefined,
    addedToday: backendTask.status === 'planned',
    carriedOver: backendTask.deferCount > 0,
    order: backendTask.sortOrder,
  };
}

// Day endpoints
export async function getDayStatus(date: string): Promise<DayStatus> {
  const response = await fetchWithAuth(`/api/day/${date}/status`);
  return response.json();
}

export async function getLeftovers(): Promise<{ leftovers: BackendTask[] }> {
  const response = await fetchWithAuth(`/api/day/leftovers`);
  return response.json();
}

// Standalone functions for React Query hooks
export async function bootstrap(date = localDate()): Promise<BootstrapResponse> {
  const response = await fetchWithAuth(`/api/bootstrap?date=${date}`);
  const data = await response.json();
  return { ...data, categories: (data.categories || []).map(mapBackendCategory) };
}

export async function getTodayTasks(date = localDate()): Promise<Task[]> {
  const response = await fetchWithAuth(`/api/tasks?date=${date}`);
  const data = await response.json();
  return (data.tasks || []).map((task: BackendTask) => mapBackendTaskToTask(task));
}

export async function createTask(task: {
  title: string;
  description?: string;
  categoryId?: string;
  urgency?: 'low' | 'medium' | 'high';
  duration?: number;
  sortOrder: number;
  status?: 'planned' | 'backlog';
  plannedForDate?: string;
}): Promise<BackendTask> {
  const response = await fetchWithAuth('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: task.title,
      description: task.description,
      categoryId: task.categoryId,
      urgency: task.urgency || 'medium',
      duration: task.duration,
      source: 'manual',
      sortOrder: task.sortOrder,
      status: task.status || 'planned',
      plannedForDate: task.plannedForDate || localDate(),
    }),
  });
  return response.json();
}

export async function updateTask(
  id: string,
  updates: {
    title?: string;
    description?: string;
    categoryId?: string;
    urgency?: 'low' | 'medium' | 'high';
    duration?: number;
    completed?: boolean;
    sortOrder?: number;
    status?: string;
    plannedForDate?: string;
  },
): Promise<BackendTask> {
  const response = await fetchWithAuth(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return response.json();
}

export async function deleteTask(id: string): Promise<void> {
  await fetchWithAuth(`/api/tasks/${id}`, {
    method: 'DELETE',
  });
}

export async function reorderTasks(tasks: Array<{ id: string; sortOrder: number }>): Promise<void> {
  await fetchWithAuth('/api/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ tasks }),
  });
}

export interface ReprioritizeResponse {
  tasks: BackendTask[];
  changes: Array<{
    task_id: string;
    rank: number;
    reason: string;
  }>;
}

export async function prioritizeTasks(
  voiceTranscript?: string,
  voiceEntryId?: string,
): Promise<{ tasks: Task[]; changes: TaskChange[] }> {
  const body: { voiceEntryId?: string } = {};
  if (voiceEntryId) {
    body.voiceEntryId = voiceEntryId;
  }

  const response = await fetchWithAuth('/api/tasks/reprioritize', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  const data: ReprioritizeResponse = await response.json();

  return {
    tasks: data.tasks.map((task) => mapBackendTaskToTask(task)),
    changes: data.changes.map((c) => ({
      taskId: c.task_id,
      direction: 'up',
      reason: c.reason,
    })),
  };
}

export async function createVoiceEntry(transcript: string): Promise<{ id: string }> {
  const response = await fetchWithAuth('/api/voice-entries', {
    method: 'POST',
    body: JSON.stringify({ transcript }),
  });
  return response.json();
}

function mapBackendCategory(category: BackendCategory | Category): Category {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    hoursPerWeek: category.hoursPerWeek || undefined,
  };
}

export async function getCategories(): Promise<Category[]> {
  return (await bootstrap()).categories;
}

export async function updateSettings(preferences: Partial<UserPrefs>, categories?: Category[]): Promise<void> {
  await fetchWithAuth('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify({ preferences, categories }),
  });
}

export async function completeOnboarding(preferences: Partial<UserPrefs>, categories: Category[]): Promise<void> {
  await fetchWithAuth('/api/onboarding', {
    method: 'POST',
    body: JSON.stringify({ preferences, categories }),
  });
}

export interface PlanTask {
  id?: string;
  title: string;
  duration: number;
  urgency: 'low' | 'medium' | 'high';
  categoryId?: string;
  disposition: 'today' | 'backlog';
  reason: string;
}

export interface PlanProposal {
  id: string;
  summary: string;
  availableMinutes: number | null;
  tasks: PlanTask[];
}

export interface DayReview {
  completedCount: number;
  carriedToTomorrowCount: number;
  droppedCount: number;
  notes: string | null;
  energyLevel: number | null;
}

export interface Workflow {
  date: string;
  state: 'planning' | 'active' | 'closed';
  version: number;
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
  proposal: PlanProposal | null;
  tasks: BackendTask[];
  backlog: BackendTask[];
  review: DayReview | null;
}

export async function getWorkflow(date = localDate()): Promise<Workflow> {
  return (await fetchWithAuth(`/api/workflow?date=${date}`)).json();
}

export async function getChatSessions(): Promise<ChatSession[]> {
  const data = await (await fetchWithAuth('/api/chat/sessions')).json();
  return data.sessions || [];
}

export async function sendChatMessage(content: string, date = localDate(), requestId: string = crypto.randomUUID(), model?: string): Promise<{ text: string; workflow: Workflow }> {
  const body: { content: string; date: string; requestId: string; model?: string } = { content, date, requestId };
  if (model) body.model = model;
  const response = await fetchWithAuth('/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response.json();
}

export async function confirmDayPlan(input: { date: string; proposalId: string; version: number }): Promise<Workflow> {
  return (await fetchWithAuth('/api/day/plan/confirm', {
    method: 'POST', body: JSON.stringify(input),
  })).json();
}

export async function discardDayPlan(input: { date: string; proposalId: string; version: number }): Promise<Workflow> {
  return (await fetchWithAuth('/api/day/plan/discard', {
    method: 'POST', body: JSON.stringify(input),
  })).json();
}

export interface CloseDayInput {
  date: string;
  taskActions: Array<{ taskId: string; action: 'done' | 'tomorrow' | 'drop' }>;
  notes?: string;
  energyLevel?: number;
}

export async function closeDay(input: CloseDayInput): Promise<DayReview & { nextDate: string }> {
  return (await fetchWithAuth('/api/day/close', {
    method: 'POST', body: JSON.stringify(input),
  })).json();
}

export async function getInboxTasks(): Promise<Task[]> {
  const data = await (await fetchWithAuth('/api/tasks?status=backlog')).json();
  return (data.tasks || []).map((task: BackendTask) => mapBackendTaskToTask(task));
}
