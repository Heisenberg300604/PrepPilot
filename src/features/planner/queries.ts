import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { Activity, Dashboard, StudyTask, TaskInput } from '@/lib/types';
import { patchCached, useApiMutation } from '@/lib/useApi';

export interface TaskQuery {
  from?: string;
  to?: string;
  status?: 'TODO' | 'DONE';
  /** TODO tasks scheduled strictly before this YYYY-MM-DD date. */
  overdueBefore?: string;
}
export const useTasks = (params: TaskQuery = {}) => useQuery({ queryKey: [...keys.tasks, params], queryFn: () => api<StudyTask[]>('/tasks', { query: params as any }) });

export const useCreateTask = () => useApiMutation<TaskInput, StudyTask>((body) => ({ path: '/tasks', method: 'POST', body }));
export const useUpdateTask = () => {
  const qc = useQueryClient();
  return useApiMutation<{ id: string } & Partial<TaskInput> & { status?: 'TODO' | 'DONE' }, StudyTask>(({ id, ...body }) => ({ path: `/tasks/${id}`, method: 'PATCH', body }), {
    // ticking a task off is instant; other edits wait for the server
    onMutate: ({ id, status }) => (status ? patchCached(qc, [keys.tasks, keys.dashboard], id, { status }) : undefined),
  });
};
export const useDeleteTask = () => useApiMutation<string>((id) => ({ path: `/tasks/${id}`, method: 'DELETE' }));

export const useDashboard = (today: string) => useQuery({ queryKey: [...keys.dashboard, today], queryFn: () => api<Dashboard>('/dashboard', { query: { today } }) });
export const useActivity = (limit = 20) => useQuery({ queryKey: [...keys.activity, limit], queryFn: () => api<Activity[]>('/activity', { query: { limit } }) });
