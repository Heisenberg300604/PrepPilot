import { BookOpen, Folder, MoreHorizontal, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Menu, Progress, type MenuItem } from '@/components/ui';
import { plural } from '@/lib/format';
import type { Subject } from '@/lib/types';
import '@/features/exams/exams.css';
import './subjects.css';

export function SubjectCard({ subject, menu }: { subject: Subject; menu: MenuItem[] }) {
  return (
    <article className={`entity-card ${subject.archived ? 'is-muted' : ''}`} style={subject.color ? ({ ['--emblem' as string]: subject.color } as React.CSSProperties) : undefined}>
      <div className="entity-top">
        <div className="subject-chip">
          <BookOpen size={19} aria-hidden />
        </div>
        <div className="entity-title">
          <h3>
            <Link to={`/subjects/${subject.id}`}>{subject.name}</Link>
          </h3>
          {subject.archived && <span className="tag tag-archived">Archived</span>}
        </div>
        <Menu label={`Actions for ${subject.name}`} trigger={<MoreHorizontal size={18} />} items={menu} />
      </div>
      {subject.description && <p className="entity-desc">{subject.description}</p>}
      <div className="meta-line">
        <span>
          <Folder size={14} aria-hidden /> {plural(subject.folderCount, 'folder')}
        </span>
        <span>
          <Play size={14} aria-hidden /> {plural(subject.stats.total, 'video')}
        </span>
      </div>
      <div className="progress-line">
        <div className="progress-line-head">
          <span>{subject.stats.completed} completed</span>
          <b>{subject.stats.percent}%</b>
        </div>
        <Progress value={subject.stats.percent} label={`${subject.name} progress`} />
      </div>
    </article>
  );
}
