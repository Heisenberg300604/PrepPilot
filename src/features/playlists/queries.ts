import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { Destination, ImportResult, Playlist, PlaylistDetail, PlaylistPreview, SyncResult } from '@/lib/types';
import { useApiMutation } from '@/lib/useApi';

export const usePlaylists = (q?: string) => useQuery({ queryKey: [...keys.playlists, 'list', q ?? ''], queryFn: () => api<Playlist[]>('/playlists', { query: { q } }) });
export const usePlaylist = (id?: string) => useQuery({ queryKey: keys.playlist(id ?? ''), queryFn: () => api<PlaylistDetail>(`/playlists/${id}`), enabled: Boolean(id) });

/** Read-only: nothing is saved until the user confirms the import. */
export const usePreviewPlaylist = () => useApiMutation<{ url: string }, PlaylistPreview>((body) => ({ path: '/playlists/preview', method: 'POST', body }), { invalidate: [], silentError: true });
export const useImportPlaylist = () => useApiMutation<{ url: string; selectedVideoIds?: string[] } & Destination, ImportResult>((body) => ({ path: '/playlists/import', method: 'POST', body }), { silentError: true });
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

/** Remove videos from this playlist. Imported playlists remember it (restorable); local collections just drop membership. */
export const useRemovePlaylistVideos = () =>
  useApiMutation<{ playlistId: string; videoIds: string[] }, { removed: number; deletedVideos: number; restorable: boolean }>(({ playlistId, videoIds }) => ({
    path: `/playlists/${playlistId}/videos/remove`,
    method: 'POST',
    body: { videoIds },
  }));
/** Bring removed videos back (re-syncs with YouTube, so progress on kept records is preserved). */
export const useRestorePlaylistVideos = () =>
  useApiMutation<{ playlistId: string; youtubeVideoIds: string[] }, SyncResult>(({ playlistId, youtubeVideoIds }) => ({
    path: `/playlists/${playlistId}/sync`,
    method: 'POST',
    body: { restore: youtubeVideoIds },
  }));

/** Saves a new video order. The list updates instantly; a failure puts the old order back (and toasts). */
export const useReorderPlaylist = (playlistId: string) => {
  const qc = useQueryClient();
  const key = keys.playlist(playlistId);
  return useApiMutation<string[]>((videoIds) => ({ path: `/playlists/${playlistId}/order`, method: 'PUT', body: { videoIds } }), {
    invalidate: [key, ['video']],
    onMutate: async (videoIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PlaylistDetail>(key);
      if (previous) {
        const pos = new Map(videoIds.map((id, i) => [id, i] as const));
        const parked = previous.videos.filter((v) => !pos.has(v.id)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        parked.forEach((v, i) => pos.set(v.id, videoIds.length + i));
        qc.setQueryData<PlaylistDetail>(key, { ...previous, customOrder: true, videos: previous.videos.map((v) => ({ ...v, position: pos.get(v.id) ?? v.position })) });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      const previous = (ctx as { previous?: PlaylistDetail } | undefined)?.previous;
      if (previous) qc.setQueryData(key, previous);
    },
  });
};
/** Drops the custom order; follow with a sync to put videos back in YouTube order. */
export const useResetPlaylistOrder = () => useApiMutation<string>((id) => ({ path: `/playlists/${id}/order`, method: 'DELETE' }), { invalidate: [] });
