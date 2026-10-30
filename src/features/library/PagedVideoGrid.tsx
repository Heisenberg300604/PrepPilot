import { useEffect, type ReactNode } from 'react';
import { Button, CardSkeletons, ErrorState } from '@/components/ui';
import type { VideoQuery } from '@/features/videos/queries';
import { useInfiniteVideos } from './queries';
import { VideoCard } from './VideoCard';

interface Props {
  query: VideoQuery;
  empty: ReactNode;
  showLocation?: boolean;
  /** Called with the loaded total so pages can show "N lectures". */
  onTotal?: (n: number) => void;
}

/** Grid of unique videos with Load more, skeletons, error + retry. */
export function PagedVideoGrid({ query, empty, showLocation = true, onTotal }: Props) {
  const q = useInfiniteVideos(query);
  const knownTotal = q.data?.pages[0]?.total;
  useEffect(() => {
    if (knownTotal !== undefined) onTotal?.(knownTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownTotal]);
  if (q.isLoading) return <CardSkeletons count={6} height={230} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <div className="video-grid" aria-busy={q.isFetching}>
        {items.map((v) => (
          <VideoCard key={v.id} video={v} showLocation={showLocation} />
        ))}
      </div>
      <div className="load-more">
        <p className="muted" role="status">
          Showing {items.length} of {total}
        </p>
        {q.hasNextPage && (
          <Button onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
            Load more
          </Button>
        )}
      </div>
    </>
  );
}
