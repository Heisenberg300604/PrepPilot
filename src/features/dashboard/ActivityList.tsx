import { CheckCircle2, ClipboardCheck, FolderPlus, GraduationCap, History, ListVideo, PlayCircle, RefreshCw, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useActivity } from '@/features/planner/queries';
import { timeAgo } from '@/lib/format';
import type { Activity } from '@/lib/types';

const META: Record<Activity['type'], { icon: LucideIcon; verb: string }> = {
  VIDEO_OPENED: { icon: PlayCircle, verb: 'Opened' },
  VIDEO_COMPLETED: { icon: CheckCircle2, verb: 'Completed' },
  PLAYLIST_IMPORTED: { icon: ListVideo, verb: 'Imported playlist' },
  PLAYLIST_SYNCED: { icon: RefreshCw, verb: 'Synced playlist' },
  TASK_COMPLETED: { icon: CheckCircle2, verb: 'Finished a study task' },
  FOLDER_CREATED: { icon: FolderPlus, verb: 'Created a folder' },
  EXAM_CREATED: { icon: GraduationCap, verb: 'Created an exam' },
  MOCK_ATTEMPTED: { icon: ClipboardCheck, verb: 'Took a mock test' },
};

/** What the activity targets, as text + optional link. Deleted targets degrade to plain text. */
export function describeActivity(a: Activity): { verb: string; target: string | null; to: string | null } {
  const { verb } = META[a.type];
  if (a.video) return { verb, target: a.video.title, to: `/watch/${a.video.id}` };
  if (a.playlist) return { verb, target: a.playlist.title, to: `/playlists/${a.playlist.id}` };
  if (a.type === 'MOCK_ATTEMPTED' && a.metadata) {
    const m = a.metadata as { title?: string; score?: number; maxScore?: number };
    return { verb, target: m.title ? `${m.title} (${m.score}/${m.maxScore})` : null, to: null };
  }
  if (a.type === 'VIDEO_OPENED' || a.type === 'VIDEO_COMPLETED') return { verb, target: 'a lecture that has since been removed', to: null };
  if (a.type === 'PLAYLIST_IMPORTED' || a.type === 'PLAYLIST_SYNCED') return { verb, target: 'a playlist that has since been removed', to: null };
  return { verb, target: null, to: null };
}

export function ActivityList({ limit = 6 }: { limit?: number }) {
  const q = useActivity(limit);
  if (q.isLoading) return <Skeleton style={{ height: 140 }} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load activity" />;
  if (!q.data?.length)
    return (
      <EmptyState icon={History} title="No activity yet">
        Real study actions — opening and completing lectures, importing playlists, finishing tasks — are logged here.
      </EmptyState>
    );
  return (
    <ul className="activity-list">
      {q.data.map((a) => {
        const { icon: Icon } = META[a.type];
        const d = describeActivity(a);
        return (
          <li key={a.id}>
            <span className="activity-icon">
              <Icon size={15} aria-hidden />
            </span>
            <span className="activity-text">
              {d.verb}
              {d.target && (
                <>
                  {' '}
                  {d.to ? <Link to={d.to}>{d.target}</Link> : <em>{d.target}</em>}
                </>
              )}
            </span>
            <time className="muted" dateTime={a.createdAt}>
              {timeAgo(a.createdAt)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
