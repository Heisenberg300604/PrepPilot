import { Play, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Progress, StatusBadge, Thumb } from '@/components/ui';
import { formatDuration, locationText } from '@/lib/format';
import type { Video } from '@/lib/types';
import { useToggleFavorite } from '@/features/videos/queries';
import './library.css';

export interface VideoCardProps {
  video: Video;
  /** Show the Exam › Subject › Folder location line. */
  showLocation?: boolean;
  /** Render a "Continue" call to action (resume from the saved position). */
  continueCta?: boolean;
}

/** Percent watched, only when the duration is known. */
export function watchedPercent(v: Pick<Video, 'status' | 'lastPositionSeconds' | 'durationSeconds'>): number | null {
  if (v.status === 'COMPLETED') return 100;
  if (!v.durationSeconds || v.durationSeconds <= 0 || v.lastPositionSeconds <= 0) return null;
  return Math.min(100, Math.round((v.lastPositionSeconds / v.durationSeconds) * 100));
}

export function resumeLabel(v: Pick<Video, 'status' | 'lastPositionSeconds'>): string {
  return v.status !== 'COMPLETED' && v.lastPositionSeconds > 0 ? `Resume at ${formatDuration(v.lastPositionSeconds)}` : v.status === 'COMPLETED' ? 'Watch again' : 'Continue';
}

export function VideoCard({ video, showLocation, continueCta }: VideoCardProps) {
  const toggle = useToggleFavorite();
  const href = `/watch/${video.id}`;
  const pct = video.status === 'IN_PROGRESS' ? watchedPercent(video) : null;
  const unavailable = video.availabilityStatus === 'PRIVATE' || video.availabilityStatus === 'REMOVED' || video.availabilityStatus === 'UNAVAILABLE';
  return (
    <article className="vc">
      <Link to={href} tabIndex={-1} aria-hidden className="vc-thumb">
        <Thumb src={video.thumbnailUrl} duration={video.durationSeconds} />
      </Link>
      <div className="vc-body">
        <div className="vc-top">
          <h3 className="vc-title">
            <Link to={href}>{video.title}</Link>
          </h3>
          <button
            type="button"
            className={`icon-btn icon-btn-sm vc-fav ${video.favorite ? 'on' : ''}`}
            aria-pressed={video.favorite}
            aria-label={video.favorite ? `Remove “${video.title}” from favorites` : `Add “${video.title}” to favorites`}
            title={video.favorite ? 'Remove from favorites' : 'Add to favorites'}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ id: video.id, favorite: !video.favorite })}
          >
            <Star size={16} fill={video.favorite ? 'currentColor' : 'none'} aria-hidden />
          </button>
        </div>
        {showLocation && <p className="vc-loc truncate">{locationText(video.location)}</p>}
        <div className="vc-meta">
          <StatusBadge status={video.status} />
          {unavailable && <span className="vc-warn">Unavailable on YouTube</span>}
        </div>
        {pct !== null && <Progress value={pct} label={`${pct}% watched`} size="sm" />}
        {continueCta && (
          <Link to={href} className="btn btn-primary btn-sm vc-cta">
            <Play size={14} fill="currentColor" aria-hidden />
            {resumeLabel(video)}
          </Link>
        )}
      </div>
    </article>
  );
}
