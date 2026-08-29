const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface ChatMessage {
  id: string;
  userId: string;
  sessionDate: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ProcessResponse {
  type: 'question' | 'confirmation' | 'tasks';
  message: string;
  proposedTasks?: Array<{
    title: string;
    description?: string;
    duration?: number;
    urgency?: string;
  }>;
}

export interface SendMessageResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  response: ProcessResponse;
}

export interface DayStatus {
  date: string;
  hasTasks: boolean;
  taskCount: number;
  hasChatMessages: boolean;
  chatMessageCount: number;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  categoryId?: string;
  urgency: string;
  duration?: number;
  source: string;
  completed: boolean;
  addedToday: boolean;
  carriedOver: boolean;
  sortOrder: number;
  dueDate?: string;
  deferCount: number;
  createdAt: string;
  updatedAt: string;
  plannedForDate: string;
  status: string;
  priorityReason?: string;
  completedAt?: string;
}

async function fetchAPI(endpoint: string, options?: RequestInit) {
  const token = localStorage.getItem('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options?.headers || {}),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export const api = {
  // Chat endpoints
  async getChatMessages(date: string): Promise<{ messages: ChatMessage[] }> {
    return fetchAPI(`/api/chat/${date}`);
  },

  async sendChatMessage(date: string, content: string): Promise<SendMessageResponse> {
    return fetchAPI(`/api/chat/${date}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  async confirmTasks(date: string, tasks: Array<{
    title: string;
    description?: string;
    duration?: number;
    urgency?: string;
    priorityReason?: string;
  }>): Promise<{ tasks: Task[] }> {
    return fetchAPI(`/api/chat/${date}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ tasks }),
    });
  },

  // Day endpoints
  async getDayStatus(date: string): Promise<DayStatus> {
    return fetchAPI(`/api/day/${date}/status`);
  },

  async getLeftovers(): Promise<{ leftovers: Task[] }> {
    return fetchAPI(`/api/day/leftovers`);
  },

  // Task endpoints
  async getTodayTasks(): Promise<{ tasks: Task[] }> {
    return fetchAPI('/api/tasks');
  },

  async toggleTask(taskId: string): Promise<Task> {
    return fetchAPI(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: true }),
    });
  },

  async createTask(task: {
    title: string;
    description?: string;
    urgency?: string;
    duration?: number;
    sortOrder: number;
  }): Promise<Task> {
    return fetchAPI('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  },
};
