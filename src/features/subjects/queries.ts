import { useQuery } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { Folder, Subject, SubjectContents } from '@/lib/types';
import { useApiMutation } from '@/lib/useApi';

export const useSubject = (id?: string) => useQuery({ queryKey: keys.subject(id ?? ''), queryFn: () => api<Subject>(`/subjects/${id}`), enabled: Boolean(id) });

/** Everything at one location of a subject: sub-folders, playlists, videos and the breadcrumb trail. */
export const useSubjectContents = (subjectId?: string, folderId?: string | null) =>
  useQuery({
    queryKey: keys.contents(subjectId ?? '', folderId),
    queryFn: () => api<SubjectContents>(`/subjects/${subjectId}/contents`, { query: { folderId } }),
    enabled: Boolean(subjectId),
  });

export interface SubjectInput {
  examId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}
export const useCreateSubject = () => useApiMutation<SubjectInput, Subject>((body) => ({ path: '/subjects', method: 'POST', body }));
export const useUpdateSubject = () =>
  useApiMutation<{ id: string } & Partial<SubjectInput> & { archived?: boolean }, Subject>(({ id, ...body }) => ({ path: `/subjects/${id}`, method: 'PATCH', body }));
export const useDeleteSubject = () => useApiMutation<string>((id) => ({ path: `/subjects/${id}`, method: 'DELETE' }));
export const useReorderSubjects = () => useApiMutation<{ examId: string; ids: string[] }>((body) => ({ path: '/subjects/reorder', method: 'POST', body }));

// ── folders ────────────────────────────────────────────────────────────────
export const useCreateFolder = () =>
  useApiMutation<{ subjectId: string; parentFolderId?: string | null; name: string; description?: string | null }, Folder>((body) => ({ path: '/folders', method: 'POST', body }));
export const useUpdateFolder = () => useApiMutation<{ id: string; name?: string; description?: string | null }, Folder>(({ id, ...body }) => ({ path: `/folders/${id}`, method: 'PATCH', body }));
/** Server rejects moving a folder into itself/descendants (400) and across users (404). */
export const useMoveFolder = () =>
  useApiMutation<{ id: string; parentFolderId: string | null; subjectId?: string }, Folder>(({ id, ...body }) => ({ path: `/folders/${id}/move`, method: 'POST', body }));
export const useDeleteFolder = () => useApiMutation<string>((id) => ({ path: `/folders/${id}`, method: 'DELETE' }));
export const useReorderFolders = () => useApiMutation<string[]>((ids) => ({ path: '/folders/reorder', method: 'POST', body: { ids } }));

// ── placements (where a playlist/video appears) ────────────────────────────
export type ContentType = 'playlist' | 'video';
export const useAddPlacement = () =>
  useApiMutation<{ type: ContentType; contentId: string; subjectId: string; folderId?: string | null }>((body) => ({ path: '/placements', method: 'POST', body }));
export const useMovePlacement = () =>
  useApiMutation<{ type: ContentType; id: string; subjectId: string; folderId?: string | null }>(({ type, id, ...body }) => ({ path: `/placements/${type}/${id}/move`, method: 'POST', body }));
/** Removes only this placement; the playlist/video and its progress stay in the library. */
export const useRemovePlacement = () => useApiMutation<{ type: ContentType; id: string }>(({ type, id }) => ({ path: `/placements/${type}/${id}`, method: 'DELETE' }));
