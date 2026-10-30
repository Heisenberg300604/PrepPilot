import { useQuery } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { Exam, ExamDetail } from '@/lib/types';
import { useApiMutation } from '@/lib/useApi';

export const useExam = (id?: string) => useQuery({ queryKey: keys.exam(id ?? ''), queryFn: () => api<ExamDetail>(`/exams/${id}`), enabled: Boolean(id) });

export interface ExamInput {
  name: string;
  description?: string | null;
  examDate?: string | null;
  color?: string | null;
  icon?: string | null;
}
export const useCreateExam = () => useApiMutation<ExamInput, Exam>((body) => ({ path: '/exams', method: 'POST', body }));
export const useUpdateExam = () =>
  useApiMutation<{ id: string } & Partial<ExamInput> & { status?: Exam['status'] }, Exam>(({ id, ...body }) => ({ path: `/exams/${id}`, method: 'PATCH', body }));
export const useDeleteExam = () => useApiMutation<string>((id) => ({ path: `/exams/${id}`, method: 'DELETE' }));
export const useDuplicateExam = () => useApiMutation<string, Exam>((id) => ({ path: `/exams/${id}/duplicate`, method: 'POST' }));
export const useReorderExams = () => useApiMutation<string[]>((ids) => ({ path: '/exams/reorder', method: 'POST', body: { ids } }));
