import { useQuery } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { Destination, ImportResult, Playlist, PlaylistDetail, PlaylistPreview, SyncResult } from '@/lib/types';
import { useApiMutation } from '@/lib/useApi';

export const usePlaylists = (q?: string) => useQuery({ queryKey: [...keys.playlists, 'list', q ?? ''], queryFn: () => api<Playlist[]>('/playlists', { query: { q } }) });
export const usePlaylist = (id?: string) => useQuery({ queryKey: keys.playlist(id ?? ''), queryFn: () => api<PlaylistDetail>(`/playlists/${id}`), enabled: Boolean(id) });

/** Read-only: nothing is saved until the user confirms the import. */
export const usePreviewPlaylist = () => useApiMutation<{ url: string }, PlaylistPreview>((body) => ({ path: '/playlists/preview', method: 'POST', body }), { invalidate: [], silentError: true });
export const useImportPlaylist = () => useApiMutation<{ url: string } & Destination, ImportResult>((body) => ({ path: '/playlists/import', method: 'POST', body }), { silentError: true });
export const useSyncPlaylist = () => useApiMutation<string, SyncResult>((id) => ({ path: `/playlists/${id}/sync`, method: 'POST' }));
export const useCreateLocalPlaylist = () =>
  useApiMutation<{ title: string; description?: string | null } & Destination, Playlist>((body) => ({ path: '/playlists', method: 'POST', body }));
/** Local edit only — never changes the playlist on YouTube. */
export const useUpdatePlaylist = () => useApiMutation<{ id: string; title?: string; description?: string | null }, Playlist>(({ id, ...body }) => ({ path: `/playlists/${id}`, method: 'PATCH', body }));
export const useDeletePlaylist = () =>
  useApiMutation<{ id: string; deleteOrphanVideos?: boolean }, { deleted: boolean; removedVideos: number }>(({ id, deleteOrphanVideos }) => ({
    path: `/playlists/${id}`,
    method: 'DELETE',
    query: { deleteOrphanVideos: deleteOrphanVideos ? 'true' : undefined },
  }));
export const useAddVideoToPlaylist = () => useApiMutation<{ playlistId: string; videoId: string }>(({ playlistId, videoId }) => ({ path: `/playlists/${playlistId}/videos`, method: 'POST', body: { videoId } }));
export const useRemoveVideoFromPlaylist = () => useApiMutation<{ playlistId: string; videoId: string }>(({ playlistId, videoId }) => ({ path: `/playlists/${playlistId}/videos/${videoId}`, method: 'DELETE' }));
