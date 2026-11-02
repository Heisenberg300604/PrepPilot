import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { ExamLink, ExamResources, LinkCategory, MockAttempt, MockTest, MockTestType } from '@/lib/types';
import { patchCached, useApiMutation } from '@/lib/useApi';

export const useExamResources = (examId?: string) =>
  useQuery({ queryKey: keys.resources(examId ?? ''), queryFn: () => api<ExamResources>(`/exams/${examId}/resources`), enabled: Boolean(examId) });

export interface LinkInput {
  title: string;
  url: string;
  category: LinkCategory;
  pinned?: boolean;
}
export interface MockTestInput {
  title: string;
  url: string;
  testType: MockTestType;
  maxScore: number;
  durationMinutes?: number | null;
  marksCorrect?: number | null;
  marksWrong?: number | null;
}
export interface AttemptInput {
  score: number;
  maxScore?: number;
  correct?: number | null;
  wrong?: number | null;
  skipped?: number | null;
  timeMinutes?: number | null;
  reflection?: string | null;
  attemptedOn: string;
}

// Resources only affect their own exam's list (and, for attempts, the activity feed), so they skip the
// library-wide invalidation every other mutation does.
const RESOURCES = [['resources']];
const WITH_ACTIVITY = [['resources'], keys.activity, keys.dashboard];

export const useAddResources = (examId: string) =>
  useApiMutation<{ links?: LinkInput[]; tests?: MockTestInput[] }, ExamResources>((body) => ({ path: `/exams/${examId}/resources`, method: 'POST', body }), { invalidate: RESOURCES });

export const useUpdateLink = () => {
  const qc = useQueryClient();
  return useApiMutation<{ id: string } & Partial<LinkInput>, ExamLink>(({ id, ...body }) => ({ path: `/links/${id}`, method: 'PATCH', body }), {
    invalidate: RESOURCES,
    // Pinning should feel instant: show it everywhere before the server answers.
    onMutate: ({ id, ...patch }) => patchCached(qc, RESOURCES, id, patch),
  });
};
export const useDeleteLink = () => useApiMutation<string>((id) => ({ path: `/links/${id}`, method: 'DELETE' }), { invalidate: RESOURCES });

export const useUpdateMockTest = () =>
  useApiMutation<{ id: string } & Partial<MockTestInput>, MockTest>(({ id, ...body }) => ({ path: `/mock-tests/${id}`, method: 'PATCH', body }), { invalidate: RESOURCES });
export const useDeleteMockTest = () => useApiMutation<string>((id) => ({ path: `/mock-tests/${id}`, method: 'DELETE' }), { invalidate: RESOURCES });

export const useLogAttempt = () =>
  useApiMutation<{ testId: string } & AttemptInput, MockAttempt>(({ testId, ...body }) => ({ path: `/mock-tests/${testId}/attempts`, method: 'POST', body }), { invalidate: WITH_ACTIVITY });
export const useDeleteAttempt = () => useApiMutation<string>((id) => ({ path: `/mock-attempts/${id}`, method: 'DELETE' }), { invalidate: WITH_ACTIVITY });
