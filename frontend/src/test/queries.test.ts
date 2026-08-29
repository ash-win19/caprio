import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useTasks, useToggleTask, useCreateTask, useDeleteTask, useReorderTasks } from '@/lib/queries';
import * as api from '@/lib/api';
import type { Task } from '@/lib/types';

vi.mock('@/lib/api');

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => 
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('React Query Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useTasks', () => {
    it('should fetch tasks successfully', async () => {
      const mockTasks: Task[] = [
        {
          id: '1',
          title: 'Test task',
          category: 'Work',
          urgency: 'high',
          completed: false,
          addedToday: true,
          carriedOver: false,
          order: 0,
        },
      ];

      vi.mocked(api.getTodayTasks).mockResolvedValue(mockTasks);

      const { result } = renderHook(() => useTasks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(mockTasks);
    });

    it('should handle fetch error', async () => {
      vi.mocked(api.getTodayTasks).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useTasks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBeDefined();
    });
  });

  describe('useToggleTask', () => {
    it('should toggle task completion', async () => {
      vi.mocked(api.updateTask).mockResolvedValue({} as api.BackendTask);

      const { result } = renderHook(() => useToggleTask(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: '1', completed: true });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.updateTask).toHaveBeenCalledWith('1', { completed: true });
    });
  });

  describe('useCreateTask', () => {
    it('should create a new task', async () => {
      const newTask = {
        title: 'New task',
        sortOrder: 0,
      };
      vi.mocked(api.createTask).mockResolvedValue({} as api.BackendTask);

      const { result } = renderHook(() => useCreateTask(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newTask);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.createTask).toHaveBeenCalledWith(newTask);
    });
  });

  describe('useDeleteTask', () => {
    it('should delete a task', async () => {
      vi.mocked(api.deleteTask).mockResolvedValue();

      const { result } = renderHook(() => useDeleteTask(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('1');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.deleteTask).toHaveBeenCalledWith('1');
    });
  });

  describe('useReorderTasks', () => {
    it('should reorder tasks', async () => {
      const reorderedTasks = [
        { id: '1', sortOrder: 0 },
        { id: '2', sortOrder: 1 },
      ];
      vi.mocked(api.reorderTasks).mockResolvedValue();

      const { result } = renderHook(() => useReorderTasks(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(reorderedTasks);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.reorderTasks).toHaveBeenCalledWith(reorderedTasks);
    });
  });
});
