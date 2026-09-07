import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Task } from './types';
import * as api from './api';
import { localDate } from './date';

export const QUERY_KEYS = {
  bootstrap: ['bootstrap'],
  tasks: ['tasks'],
  categories: ['categories'],
  workflow: ['workflow'],
  inbox: ['inbox'],
  sessions: ['chat-sessions'],
} as const;

export async function invalidatePlanningQueries(client: QueryClient) {
  await Promise.all(Object.values(QUERY_KEYS).map(queryKey => client.invalidateQueries({ queryKey })));
}

export function useBootstrap(date = localDate()) {
  return useQuery({ queryKey: [...QUERY_KEYS.bootstrap, date], queryFn: () => api.bootstrap(date), staleTime: 60_000 });
}

export function useWorkflow(date = localDate()) {
  return useQuery({ queryKey: [...QUERY_KEYS.workflow, date], queryFn: () => api.getWorkflow(date), staleTime: 0 });
}

export function useChatSessions() {
  return useQuery({ queryKey: QUERY_KEYS.sessions, queryFn: api.getChatSessions, staleTime: 30_000 });
}

export function useTasks(date = localDate()) {
  const { data: account } = useBootstrap(date);
  return useQuery({
    queryKey: [...QUERY_KEYS.tasks, date],
    queryFn: () => api.getTodayTasks(date),
    staleTime: 30_000,
    select: tasks => tasks.map(task => ({ ...task, category: account?.categories.find(category => category.id === task.categoryId)?.name || task.category })),
  });
}

export function useInboxTasks() {
  const { data: account } = useBootstrap();
  return useQuery({
    queryKey: QUERY_KEYS.inbox,
    queryFn: api.getInboxTasks,
    select: tasks => tasks.map(task => ({ ...task, category: account?.categories.find(category => category.id === task.categoryId)?.name || task.category })),
  });
}

export function useToggleTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => api.updateTask(id, { completed }),
    onMutate: async ({ id, completed }) => {
      await client.cancelQueries({ queryKey: QUERY_KEYS.tasks });
      const previous = client.getQueriesData<Task[]>({ queryKey: QUERY_KEYS.tasks });
      client.setQueriesData<Task[]>({ queryKey: QUERY_KEYS.tasks }, tasks => tasks?.map(task => task.id === id ? { ...task, completed } : task));
      return { previous };
    },
    onError: (_error, _variables, context) => context?.previous.forEach(([key, tasks]) => client.setQueryData(key, tasks)),
    onSettled: () => invalidatePlanningQueries(client),
  });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.createTask, onSuccess: () => invalidatePlanningQueries(client) });
}

export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateTask>[1] }) => api.updateTask(id, updates),
    onSuccess: () => invalidatePlanningQueries(client),
  });
}

export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.deleteTask, onSuccess: () => invalidatePlanningQueries(client) });
}

export function useReorderTasks() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.reorderTasks,
    onMutate: async (reorderedTasks) => {
      await client.cancelQueries({ queryKey: QUERY_KEYS.tasks });
      const previous = client.getQueriesData<Task[]>({ queryKey: QUERY_KEYS.tasks });
      const order = new Map(reorderedTasks.map(task => [task.id, task.sortOrder]));
      client.setQueriesData<Task[]>({ queryKey: QUERY_KEYS.tasks }, tasks => tasks?.map(task => ({ ...task, order: order.get(task.id) ?? task.order })).sort((a, b) => a.order - b.order));
      return { previous };
    },
    onError: (_error, _variables, context) => context?.previous.forEach(([key, tasks]) => client.setQueryData(key, tasks)),
    onSettled: () => invalidatePlanningQueries(client),
  });
}

export function useCategories() {
  const query = useBootstrap();
  return { ...query, data: query.data?.categories };
}
