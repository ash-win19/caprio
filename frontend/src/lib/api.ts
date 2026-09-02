import type { Task, TaskChange, Category, UserPrefs } from './types';
import { toast } from '@/hooks/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:8080';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAuthToken(): string | null {
  return localStorage.getItem('caprio_session') || localStorage.getItem('auth_token');
}

async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
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
    localStorage.removeItem('caprio_session');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('onboarding_complete');
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
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

// Chat types (preserved for type compatibility, not used)
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
  user_id: string;
  title: string;
  description?: string | null;
  category_id?: string | null;
  urgency: 'low' | 'medium' | 'high';
  duration?: number | null;
  source: string;
  completed: boolean;
  sort_order: number;
  planned_for_date: string;
  status: string;
  priority_reason?: string | null;
  defer_count: number;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendCategory {
  id: string;
  user_id: string;
  name: string;
  color: string;
  hours_per_week?: number | null;
  created_at: string;
}

export interface BootstrapResponse {
  user: {
    id: string;
    email: string;
    name: string;
  };
  preferences: UserPrefs;
  categories: Category[];
  todayTasks: BackendTask[];
  backlog: BackendTask[];
  streak: number;
}

function mapBackendTaskToTask(backendTask: BackendTask): Task {
  return {
    id: backendTask.id,
    title: backendTask.title,
    category: 'Work', // TODO: map category_id to category name
    urgency: backendTask.urgency,
    duration: backendTask.duration || undefined,
    source: backendTask.source,
    completed: backendTask.completed,
    addedToday: backendTask.status === 'planned',
    carriedOver: backendTask.defer_count > 0,
    order: backendTask.sort_order,
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
export async function bootstrap(): Promise<BootstrapResponse> {
  const response = await fetchWithAuth('/api/bootstrap');
  return response.json();
}

export async function getTodayTasks(): Promise<Task[]> {
  const response = await fetchWithAuth('/api/tasks');
  const data = await response.json();
  return (data.tasks || []).map(mapBackendTaskToTask);
}

export async function createTask(task: {
  title: string;
  description?: string;
  categoryId?: string;
  urgency?: 'low' | 'medium' | 'high';
  duration?: number;
  sortOrder: number;
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
      status: 'planned',
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
    tasks: data.tasks.map(mapBackendTaskToTask),
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

export async function getCategories(): Promise<Category[]> {
  const bootstrapData = await bootstrap();
  return bootstrapData.categories.map((c: BackendCategory) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    hoursPerWeek: c.hours_per_week || undefined,
  }));
}

export async function updateSettings(prefs: Partial<UserPrefs>): Promise<void> {
  // TODO: Implement backend endpoint for updating user preferences
  console.warn('updateSettings not yet implemented on backend');
}

export async function sendChatMessage(content: string): Promise<{ text: string }> {
  const response = await fetchWithAuth('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  return response.json();
}
