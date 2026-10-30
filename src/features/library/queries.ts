import { useInfiniteQuery } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { VideoList } from '@/lib/types';
import type { VideoQuery } from '@/features/videos/queries';

export const PAGE_SIZE = 24;

/** Paged library listing ("Load more"); keyed under keys.videos so every progress change refreshes it. */
export function useInfiniteVideos(query: VideoQuery) {
  return useInfiniteQuery({
    queryKey: [...keys.videos, 'infinite', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<VideoList>('/videos', { query: { ...(query as any), limit: PAGE_SIZE, offset: pageParam } }),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length > 0 ? loaded : undefined;
    },
  });
}
