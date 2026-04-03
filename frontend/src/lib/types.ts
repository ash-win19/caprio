export type Urgency = 'low' | 'medium' | 'high';
export type VoiceState = 'idle' | 'listening' | 'processing';

export interface Task {
  id: string;
  title: string;
  category: string;
  urgency: Urgency;
  duration?: number;
  source?: string;
  completed: boolean;
  addedToday: boolean;
  carriedOver: boolean;
  order: number;
}

export interface TaskChange {
  taskId: string;
  direction: 'up' | 'down' | 'new';
  reason: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  hoursPerWeek?: number;
}

export interface UserPrefs {
  briefTime: string;
  nudgeFrequency: 'light' | 'regular' | 'focused';
  proactiveReprioritization: boolean;
  eodReminder: boolean;
  eodTime: string;
  micSensitivity: number;
  language: string;
  saveTranscripts: boolean;
}

export interface VoiceEntry {
  id: string;
  transcript: string;
  timestamp: string;
}

export const CATEGORY_COLORS: Record<string, string> = {
  Work: '#4A7CFF',
  Gym: '#F97316',
  'Personal Growth': '#A855F7',
  Health: '#EF4444',
  Finance: '#EAB308',
  Social: '#EC4899',
  Learning: '#06B6D4',
  Family: '#84CC16',
};

export const DEFAULT_CATEGORIES: Category[] = [
  { id: '1', name: 'Work', color: '#4A7CFF', hoursPerWeek: 40 },
  { id: '2', name: 'Gym', color: '#F97316', hoursPerWeek: 5 },
  { id: '3', name: 'Personal Growth', color: '#A855F7', hoursPerWeek: 5 },
  { id: '4', name: 'Health', color: '#EF4444', hoursPerWeek: 3 },
  { id: '5', name: 'Finance', color: '#EAB308', hoursPerWeek: 2 },
  { id: '6', name: 'Social', color: '#EC4899', hoursPerWeek: 4 },
  { id: '7', name: 'Learning', color: '#06B6D4', hoursPerWeek: 3 },
  { id: '8', name: 'Family', color: '#84CC16', hoursPerWeek: 5 },
];
