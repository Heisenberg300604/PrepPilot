import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { ProgressStatus, Video, VideoDetail, VideoList } from '@/lib/types';
import { useApiMutation } from '@/lib/useApi';

export interface VideoQuery {
  q?: string;
  status?: ProgressStatus;
  favorite?: boolean;
  studied?: boolean;
  unfiled?: boolean;
  examId?: string;
  subjectId?: string;
  folderId?: string;
  sort?: 'recent' | 'added' | 'title' | 'duration' | 'studied';
  limit?: number;
  offset?: number;
}
/** Library listing: each underlying video appears once, however many places it is filed in. */
export const useVideos = (params: VideoQuery = {}) =>
  useQuery({ queryKey: [...keys.videos, params], queryFn: () => api<VideoList>('/videos', { query: params as any }), placeholderData: keepPreviousData });

export const useVideo = (id?: string, playlistId?: string | null) =>
  useQuery({ queryKey: [...keys.video(id ?? ''), playlistId ?? null], queryFn: () => api<VideoDetail>(`/videos/${id}`, { query: { playlistId } }), enabled: Boolean(id) });

export interface AddVideoInput {
  url: string;
  title?: string;
  description?: string | null;
  subjectId?: string;
  folderId?: string | null;
  playlistId?: string;
}
/** 422 METADATA_UNAVAILABLE means YouTube details could not be fetched — ask the user for a title and retry. */
export const useAddVideo = () => useApiMutation<AddVideoInput, Video>((body) => ({ path: '/videos', method: 'POST', body }), { silentError: true });
export const useUpdateVideo = () => useApiMutation<{ id: string; title?: string; description?: string | null }, Video>(({ id, ...body }) => ({ path: `/videos/${id}`, method: 'PATCH', body }));

/** Status and playback position are independent; position-only saves never change a COMPLETED video's status. */
export const useSetProgress = () =>
  useApiMutation<{ id: string; status?: ProgressStatus; lastPositionSeconds?: number }, { status: ProgressStatus; lastPositionSeconds: number }>(({ id, ...body }) => ({
    path: `/videos/${id}/progress`,
    method: 'PUT',
    body,
  }));
/** Fire-and-forget position saves while playing: no toast spam, no list refetch storms. */
export const useSavePosition = () =>
  useApiMutation<{ id: string; lastPositionSeconds: number }>(({ id, ...body }) => ({ path: `/videos/${id}/progress`, method: 'PUT', body }), { invalidate: [], silentError: true });
export const useOpenVideo = () => useApiMutation<string>((id) => ({ path: `/videos/${id}/open`, method: 'POST' }), { invalidate: [keys.dashboard, keys.activity, keys.videos], silentError: true });
export const useSaveNote = () =>
  useApiMutation<{ id: string; content: string }, { content: string; updatedAt: string }>(({ id, content }) => ({ path: `/videos/${id}/note`, method: 'PUT', body: { content } }), { invalidate: [], silentError: true });
export const useToggleFavorite = () =>
  useApiMutation<{ id: string; favorite: boolean }>(({ id, favorite }) => ({ path: `/videos/${id}/favorite`, method: 'PUT', body: { favorite } }));
/** Without force=true the API answers 409 with details {placements, playlists, hasProgress, hasNote, favorite} when the video is in use. */
export const useDeleteVideo = () => useApiMutation<{ id: string; force?: boolean }>(({ id, force }) => ({ path: `/videos/${id}`, method: 'DELETE', query: { force: force ? 'true' : undefined } }), { silentError: true });
