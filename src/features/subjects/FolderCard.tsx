import { Folder as FolderIcon, MoreHorizontal, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Menu, Progress, type MenuItem } from '@/components/ui';
import { plural } from '@/lib/format';
import type { Folder } from '@/lib/types';
import { dragSource, useDropTarget, type DragPayload } from './dnd';
import '@/features/exams/exams.css';
import './subjects.css';

export function FolderCard({ folder, subjectId, menu, onDropOn }: { folder: Folder; subjectId: string; menu: MenuItem[]; onDropOn: (folderId: string, p: DragPayload) => void }) {
  const drop = useDropTarget((p) => {
    if (p.kind === 'folder' && p.id === folder.id) return;
    onDropOn(folder.id, p);
  });
  return (
    <article className={`entity-card folder-card draggable ${drop.over ? 'is-drop' : ''}`} {...dragSource({ kind: 'folder', id: folder.id })} {...drop.props}>
      <div className="folder-top">
        <div className="folder-icon">
          <FolderIcon size={20} aria-hidden />
        </div>
        <div className="entity-title">
          <h3 className="truncate">
            <Link to={`/subjects/${subjectId}?folder=${folder.id}`}>{folder.name}</Link>
          </h3>
        </div>
        <Menu label={`Actions for folder ${folder.name}`} trigger={<MoreHorizontal size={18} />} items={menu} />
      </div>
      <div className="meta-line">
        <span>
          <FolderIcon size={14} aria-hidden /> {plural(folder.childFolderCount, 'sub-folder')}
        </span>
        <span>
          <Play size={14} aria-hidden /> {plural(folder.stats.total, 'video')}
        </span>
      </div>
      <div className="progress-line">
        <div className="progress-line-head">
          <span>{folder.stats.completed} completed</span>
          <b>{folder.stats.percent}%</b>
        </div>
        <Progress value={folder.stats.percent} label={`${folder.name} progress`} size="sm" />
      </div>
    </article>
  );
}
