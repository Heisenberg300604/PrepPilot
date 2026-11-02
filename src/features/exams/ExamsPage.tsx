import { BookOpen, Calendar, GraduationCap, MoreHorizontal, Play, Plus, Search } from 'lucide-react';
import { ExamEmblem } from './examIcons';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, CardSkeletons, EmptyState, ErrorState, Menu, PageHeader, Progress, Segmented, type MenuItem } from '@/components/ui';
import { useExams } from '@/features/common/queries';
import { useDialogs } from '@/lib/dialogs';
import { formatDate, plural } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import type { Exam } from '@/lib/types';
import { daysLeftLabel } from './examUtils';
import { useExamActions } from './examActions';
import { useReorderExams } from './queries';
import './exams.css';

type Tab = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
const TAB_LABEL: Record<Tab, string> = { ACTIVE: 'Active', COMPLETED: 'Completed', ARCHIVED: 'Archived' };

export function ExamCard({ exam, menu }: { exam: Exam; menu: MenuItem[] }) {
  const soon = exam.examDate && exam.status === 'ACTIVE' ? daysLeftLabel(exam.examDate) : '';
  return (
    <article className={`entity-card ${exam.status === 'ARCHIVED' ? 'is-muted' : ''}`} style={exam.color ? ({ ['--emblem' as string]: exam.color } as React.CSSProperties) : undefined}>
      <div className="entity-top">
        <div className="emblem">
          <ExamEmblem icon={exam.icon} />
        </div>
        <div className="entity-title">
          <h3>
            <Link to={`/exams/${exam.id}`}>{exam.name}</Link>
          </h3>
          <div className="row row-wrap" style={{ gap: 6, marginTop: 4 }}>
            {exam.status === 'COMPLETED' && <span className="tag tag-completed">Completed</span>}
            {exam.status === 'ARCHIVED' && <span className="tag tag-archived">Archived</span>}
            {exam.examDate && (
              <span className={`tag ${soon && /days left|Tomorrow|Exam day/.test(soon) ? 'tag-soon' : ''}`}>
                <Calendar size={12} aria-hidden /> {formatDate(exam.examDate)}
                {soon ? ` · ${soon}` : ''}
              </span>
            )}
          </div>
        </div>
        <Menu label={`Actions for ${exam.name}`} trigger={<MoreHorizontal size={18} />} items={menu} />
      </div>
      {exam.description && <p className="entity-desc">{exam.description}</p>}
      <div className="meta-line">
        <span>
          <BookOpen size={14} aria-hidden /> {plural(exam.subjectCount, 'subject')}
        </span>
        <span>
          <Play size={14} aria-hidden /> {plural(exam.stats.total, 'video')}
        </span>
      </div>
      <div className="progress-line">
        <div className="progress-line-head">
          <span>
            {exam.stats.completed} of {exam.stats.total} completed
          </span>
          <b>{exam.stats.percent}%</b>
        </div>
        <Progress value={exam.stats.percent} label={`${exam.name} completion`} />
      </div>
    </article>
  );
}

export default function ExamsPage() {
  useDocumentTitle('My exams');
  const dialogs = useDialogs();
  const exams = useExams();
  const reorder = useReorderExams();
  const actions = useExamActions();
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [q, setQ] = useState('');

  const all = useMemo(() => [...(exams.data ?? [])].sort((a, b) => a.displayOrder - b.displayOrder), [exams.data]);
  const counts = useMemo(() => ({ ACTIVE: all.filter((e) => e.status === 'ACTIVE').length, COMPLETED: all.filter((e) => e.status === 'COMPLETED').length, ARCHIVED: all.filter((e) => e.status === 'ARCHIVED').length }), [all]);
  const visible = all.filter((e) => e.status === tab && e.name.toLowerCase().includes(q.trim().toLowerCase()));

  /** Swap with the previous/next exam in the visible list, expressed as a reorder of the full list. */
  const move = (exam: Exam, dir: -1 | 1) => {
    const i = visible.findIndex((e) => e.id === exam.id);
    const other = visible[i + dir];
    if (!other) return;
    const ids = all.map((e) => e.id);
    const a = ids.indexOf(exam.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    reorder.mutate(ids);
  };

  const emptyTitle = q ? 'No exams match your search' : tab === 'ACTIVE' ? 'Your next goal starts here' : tab === 'COMPLETED' ? 'No completed exams yet' : 'Nothing archived';

  return (
    <>
      <PageHeader
        eyebrow="Your preparation"
        title="My exams"
        description="Each exam is a workspace with its own subjects, folders and lectures."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'exam' })}>
            Create exam
          </Button>
        }
      />
      <div className="toolbar">
        <Segmented<Tab>
          label="Filter exams by status"
          value={tab}
          onChange={setTab}
          options={(Object.keys(TAB_LABEL) as Tab[]).map((t) => ({ value: t, label: TAB_LABEL[t], count: exams.data ? counts[t] : undefined }))}
        />
        <div className="toolbar-search">
          <Search size={16} aria-hidden />
          <input className="input" type="search" aria-label="Search exams" placeholder="Find an exam…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {exams.isLoading ? (
        <CardSkeletons count={3} height={200} />
      ) : exams.isError ? (
        <ErrorState error={exams.error} onRetry={() => exams.refetch()} title="Couldn’t load your exams" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={emptyTitle}
          action={
            q ? (
              <Button onClick={() => setQ('')}>Clear search</Button>
            ) : tab === 'ACTIVE' ? (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'exam' })}>
                Create your first exam
              </Button>
            ) : (
              <Button onClick={() => setTab('ACTIVE')}>See active exams</Button>
            )
          }
        >
          {q ? 'Try a different name.' : tab === 'ACTIVE' ? 'Create an exam to organise subjects, playlists and lectures in one place.' : tab === 'COMPLETED' ? 'Exams you mark as completed will appear here.' : 'Archived exams are hidden from your dashboard but never deleted.'}
        </EmptyState>
      ) : (
        <div className="exam-grid">
          {visible.map((exam, i) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              menu={actions.items(exam, { onMoveUp: i > 0 ? () => move(exam, -1) : undefined, onMoveDown: i < visible.length - 1 ? () => move(exam, 1) : undefined })}
            />
          ))}
        </div>
      )}
      {actions.dialogNode}
    </>
  );
}

