import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Task, TaskChange } from './types';
import * as api from './api';
import { useAppStore } from './store';

export const QUERY_KEYS = {
  bootstrap: ['bootstrap'],
  tasks: ['tasks'],
  categories: ['categories'],
} as const;

export function useBootstrap() {
  return useQuery({
    queryKey: QUERY_KEYS.bootstrap,
    queryFn: api.bootstrap,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTasks() {
  return useQuery({
    queryKey: QUERY_KEYS.tasks,
    queryFn: api.getTodayTasks,
    staleTime: 1000 * 30,
  });
}

export function useToggleTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      return api.updateTask(id, { completed });
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
      
      const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
      
      queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) => 
        old?.map((t) => (t.id === id ? { ...t, completed } : t)) || []
      );
      
      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateTask>[1] }) => {
      return api.updateTask(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.deleteTask,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
      
      const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
      
      queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) => 
        old?.filter((t) => t.id !== id) || []
      );
      
      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useReorderTasks() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: api.reorderTasks,
    onMutate: async (reorderedTasks) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
      
      const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
      
      queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) => {
        if (!old) return [];
        
        const taskMap = new Map(reorderedTasks.map((t) => [t.id, t.sortOrder]));
        return old
          .map((t) => ({
            ...t,
            order: taskMap.get(t.id) ?? t.order,
          }))
          .sort((a, b) => a.order - b.order);
      });
      
      return { previousTasks };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useReprioritizeTasks() {
  const queryClient = useQueryClient();
  const { applyPrioritization } = useAppStore();
  
  return useMutation({
    mutationFn: ({ voiceTranscript, voiceEntryId }: { voiceTranscript?: string; voiceEntryId?: string }) => {
      return api.prioritizeTasks(voiceTranscript, voiceEntryId);
    },
    onSuccess: (data: { tasks: Task[]; changes: TaskChange[] }) => {
      applyPrioritization(data.tasks, data.changes);
      queryClient.setQueryData(QUERY_KEYS.tasks, data.tasks);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks });
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: QUERY_KEYS.categories,
    queryFn: api.getCategories,
    staleTime: 1000 * 60 * 60,
  });
}
