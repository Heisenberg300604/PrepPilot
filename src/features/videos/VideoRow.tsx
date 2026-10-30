// Contract (shared with other features): video, index?, playlistId?, showLocation?, extraMenu?
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, MoreHorizontal, Pencil, RotateCcw, Star } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton, Menu, StatusBadge, Thumb, type MenuItem } from '@/components/ui';
import { locationText } from '@/lib/format';
import type { Video } from '@/lib/types';
import { watchUrl } from '@/features/playlists/helpers';
import { EditVideoTitleDialog } from './EditVideoTitleDialog';
import { useSetProgress, useToggleFavorite } from './queries';
import './videos.css';

export interface VideoRowProps {
  video: Video;
  /** Display position (1-based) in a list, e.g. playlist order. */
  index?: number;
  /** When set, opening the video carries `?playlist=<id>` so prev/next follows that playlist. */
  playlistId?: string;
  /** Show the Exam › Subject › Folder location under the title. */
  showLocation?: boolean;
  /** Extra menu entries appended to the row's "More actions" menu (e.g. Move to…, Remove from folder). */
  extraMenu?: MenuItem[];
}

export function VideoRow({ video, index, playlistId, showLocation, extraMenu = [] }: VideoRowProps) {
  const progress = useSetProgress();
  const favorite = useToggleFavorite();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const done = video.status === 'COMPLETED';
  const unavailable = video.availabilityStatus !== 'AVAILABLE' && video.availabilityStatus !== 'UNKNOWN';
  const href = watchUrl(video.id, playlistId);

  const items: MenuItem[] = [
    { label: 'Open', icon: <ExternalLink size={16} />, onSelect: () => nav(href) },
    done
      ? { label: 'Reopen', icon: <RotateCcw size={16} />, onSelect: () => progress.mutate({ id: video.id, status: 'IN_PROGRESS' }) }
      : { label: 'Mark complete', icon: <CheckCircle2 size={16} />, onSelect: () => progress.mutate({ id: video.id, status: 'COMPLETED' }) },
    ...(video.status !== 'IN_PROGRESS' && !done ? [{ label: 'Mark in progress', icon: <CircleDashed size={16} />, onSelect: () => progress.mutate({ id: video.id, status: 'IN_PROGRESS' as const }) }] : []),
    { label: video.favorite ? 'Remove favorite' : 'Add to favorites', icon: <Star size={16} />, onSelect: () => favorite.mutate({ id: video.id, favorite: !video.favorite }) },
    { label: 'Edit title', icon: <Pencil size={16} />, onSelect: () => setEditing(true) },
    ...extraMenu.map((m, i) => (i === 0 ? { ...m, separated: true } : m)),
  ];

  return (
    <div className={`vrow ${video.removedFromSource ? 'is-removed' : ''}`}>
      <input
        type="checkbox"
        className="vrow-check"
        checked={done}
        disabled={progress.isPending}
        aria-label={`Mark ${video.title} as complete`}
        onChange={(e) => progress.mutate({ id: video.id, status: e.target.checked ? 'COMPLETED' : 'IN_PROGRESS' })}
      />
      <Link to={href} className="vrow-thumb" tabIndex={-1} aria-hidden>
        <Thumb src={video.thumbnailUrl} duration={video.durationSeconds} />
        {index != null && <span className="vrow-index">{index}</span>}
      </Link>
      <div className="vrow-main">
        <Link to={href} className="vrow-title">
          {video.title}
        </Link>
        <div className="vrow-meta">
          <StatusBadge status={video.status} />
          {video.removedFromSource && (
            <span className="badge badge-warn">
              <AlertTriangle size={13} aria-hidden /> Removed from YouTube playlist
            </span>
          )}
          {unavailable && !video.removedFromSource && (
            <span className="badge badge-warn">
              <AlertTriangle size={13} aria-hidden /> {video.availabilityStatus === 'PRIVATE' ? 'Private video' : 'Unavailable'}
            </span>
          )}
          {video.channelTitle && <span className="truncate">{video.channelTitle}</span>}
        </div>
        {showLocation && <div className="vrow-meta truncate">{locationText(video.location)}</div>}
      </div>
      <div className="vrow-actions">
        <IconButton label={video.favorite ? `Remove ${video.title} from favorites` : `Add ${video.title} to favorites`} className={`fav-btn ${video.favorite ? 'is-fav' : ''}`} aria-pressed={video.favorite} onClick={() => favorite.mutate({ id: video.id, favorite: !video.favorite })}>
          <Star size={18} />
        </IconButton>
        <Menu label={`More actions for ${video.title}`} trigger={<MoreHorizontal size={18} />} items={items} />
      </div>
      {editing && <EditVideoTitleDialog video={video} onClose={() => setEditing(false)} />}
    </div>
  );
}
