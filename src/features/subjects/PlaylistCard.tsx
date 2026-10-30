import { ListVideo, MoreHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Menu, Progress, Thumb, type MenuItem } from '@/components/ui';
import { plural } from '@/lib/format';
import type { Playlist } from '@/lib/types';
import { dragSource } from './dnd';
import '@/features/exams/exams.css';
import './subjects.css';

export function PlaylistCard({ playlist, menu }: { playlist: Playlist; menu: MenuItem[] }) {
  return (
    <article className="entity-card playlist-card draggable" {...(playlist.placementId ? dragSource({ kind: 'playlist', id: playlist.id, placementId: playlist.placementId }) : {})}>
      <Thumb src={playlist.thumbnailUrl} alt="" />
      <div className="playlist-body">
        <div className="entity-top">
          <div className="entity-title">
            <h3 style={{ fontSize: 15 }}>
              <Link to={`/playlists/${playlist.id}`}>{playlist.title}</Link>
            </h3>
            <div className="meta-line" style={{ marginTop: 4 }}>
              <span>
                <ListVideo size={14} aria-hidden /> {plural(playlist.stats.total, 'video')}
              </span>
              {playlist.channelTitle && <span className="truncate">{playlist.channelTitle}</span>}
            </div>
          </div>
          <Menu label={`Actions for playlist ${playlist.title}`} trigger={<MoreHorizontal size={18} />} items={menu} />
        </div>
        <div className="progress-line">
          <div className="progress-line-head">
            <span>
              {playlist.stats.completed} of {playlist.stats.total} completed
            </span>
            <b>{playlist.stats.percent}%</b>
          </div>
          <Progress value={playlist.stats.percent} label={`${playlist.title} progress`} size="sm" />
        </div>
      </div>
    </article>
  );
}
