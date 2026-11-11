export type Urgency = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  title: string;
  description?: string;
  category: string;
  categoryId?: string;
  urgency: Urgency;
  duration?: number;
  source?: string;
  completed: boolean;
  addedToday: boolean;
  carriedOver: boolean;
  /** How many times Rollover has carried the task forward. */
  carryCount?: number;
  order: number;
  plannedForDate?: string;
  priorityReason?: string;
  status?: string;
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
