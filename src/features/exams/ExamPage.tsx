import { Archive, ArchiveRestore, BookOpen, Calendar, CheckCircle2, GraduationCap, MoreHorizontal, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, Menu, Progress, Skeleton } from '@/components/ui';
import { SubjectCard } from '@/features/subjects/SubjectCard';
import { useReorderSubjects } from '@/features/subjects/queries';
import { useSubjectActions } from '@/features/subjects/subjectActions';
import { ApiError } from '@/lib/api';
import { useDialogs } from '@/lib/dialogs';
import { formatDate } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { daysLeftLabel } from './examUtils';
import { useExamActions } from './examActions';
import { useExam } from './queries';
import { reorderedIds } from '@/features/subjects/folderTreeUtils';
import './exams.css';

export default function ExamPage() {
  const { examId } = useParams();
  const nav = useNavigate();
  const dialogs = useDialogs();
  const exam = useExam(examId);
  const examActions = useExamActions();
  const subjectActions = useSubjectActions();
  const reorder = useReorderSubjects();
  useDocumentTitle(exam.data?.name ?? 'Exam');

  if (exam.isLoading)
    return (
      <>
        <Skeleton style={{ height: 220, marginBottom: 24 }} />
        <CardSkeletons count={3} height={170} />
      </>
    );
  if (exam.isError) {
    const notFound = exam.error instanceof ApiError && exam.error.status === 404;
    return notFound ? (
      <EmptyState icon={GraduationCap} title="We couldn’t find that exam" action={<Button onClick={() => nav('/exams')}>Back to my exams</Button>}>
        It may have been deleted, or the link is wrong.
      </EmptyState>
    ) : (
      <ErrorState error={exam.error} onRetry={() => exam.refetch()} title="Couldn’t load this exam" />
    );
  }
  const e = exam.data!;
  const ids = e.subjects.map((s) => s.id);
  const move = (id: string, dir: -1 | 1) => {
    const next = reorderedIds(ids, id, dir);
    if (next) reorder.mutate({ examId: e.id, ids: next });
  };
  const left = e.status === 'ACTIVE' ? daysLeftLabel(e.examDate) : '';
  const examMenu = examActions.items(e, { hideOpen: true, onDeleted: () => nav('/exams', { replace: true }) });

  return (
    <>
      <Breadcrumbs items={[{ label: 'My exams', to: '/exams' }, { label: e.name }]} />
      <section className="hero-card" aria-labelledby="exam-title" style={e.color ? ({ ['--emblem' as string]: e.color } as React.CSSProperties) : undefined}>
        <div className="hero-top">
          <div className="emblem emblem-lg">
            <GraduationCap size={28} aria-hidden />
          </div>
          <div className="hero-title">
            <div className="eyebrow">Exam workspace</div>
            <h1 id="exam-title">{e.name}</h1>
            {e.description && <p className="page-desc">{e.description}</p>}
            <div className="row row-wrap" style={{ gap: 8 }}>
              {e.status !== 'ACTIVE' && <span className={`tag ${e.status === 'COMPLETED' ? 'tag-completed' : 'tag-archived'}`}>{e.status === 'COMPLETED' ? 'Completed' : 'Archived'}</span>}
              {e.examDate && (
                <span className={`tag ${left && left !== '' && /days left|Tomorrow|Exam day/.test(left) ? 'tag-soon' : ''}`}>
                  <Calendar size={12} aria-hidden /> {formatDate(e.examDate)}
                  {left ? ` · ${left}` : ''}
                </span>
              )}
            </div>
          </div>
          <div className="hero-actions">
            <Button icon={<Pencil size={15} />} onClick={() => dialogs.open({ kind: 'exam', exam: e })}>
              Edit
            </Button>
            {e.status === 'ACTIVE' && (
              <Button icon={<CheckCircle2 size={15} />} onClick={() => examActions.setStatus(e, 'COMPLETED', `“${e.name}” marked completed`)}>
                Mark completed
              </Button>
            )}
            {e.status === 'COMPLETED' && (
              <Button icon={<RotateCcw size={15} />} onClick={() => examActions.setStatus(e, 'ACTIVE', `“${e.name}” is active again`)}>
                Reopen
              </Button>
            )}
            {e.status === 'ARCHIVED' ? (
              <Button icon={<ArchiveRestore size={15} />} onClick={() => examActions.setStatus(e, 'ACTIVE', `“${e.name}” restored`)}>
                Restore
              </Button>
            ) : (
              <Button icon={<Archive size={15} />} onClick={() => examActions.setStatus(e, 'ARCHIVED', `“${e.name}” archived`)}>
                Archive
              </Button>
            )}
            <Menu label="More exam actions" trigger={<MoreHorizontal size={18} />} items={examMenu.filter((i) => ['Duplicate structure', 'Delete…'].includes(i.label))} />
          </div>
        </div>
        <div className="hero-progress">
          <div className="progress-line-head">
            <span>Overall progress</span>
            <b>{e.stats.percent}%</b>
          </div>
          <Progress value={e.stats.percent} label="Overall exam progress" size="lg" />
        </div>
        <div className="stat-strip">
          <div className="stat">
            <strong>{e.subjects.length}</strong>
            <span>{e.subjects.length === 1 ? 'Subject' : 'Subjects'}</span>
          </div>
          <div className="stat">
            <strong>{e.stats.total}</strong>
            <span>Videos</span>
          </div>
          <div className="stat">
            <strong>{e.stats.completed}</strong>
            <span>Completed</span>
          </div>
          <div className="stat">
            <strong>{e.stats.remaining}</strong>
            <span>Remaining</span>
          </div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h2>Subjects</h2>
          <p>Open a subject to organise folders, playlists and lectures.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'subject', examId: e.id })}>
          Add subject
        </Button>
      </div>
      {e.subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Start with a subject"
          action={
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'subject', examId: e.id })}>
              Add your first subject
            </Button>
          }
        >
          Subjects such as “Mathematics” or “English” hold your folders, playlists and lectures.
        </EmptyState>
      ) : (
        <div className="subject-grid">
          {e.subjects.map((s, i) => (
            <SubjectCard
              key={s.id}
              subject={s}
              menu={subjectActions.items(s, { onMoveUp: i > 0 ? () => move(s.id, -1) : undefined, onMoveDown: i < e.subjects.length - 1 ? () => move(s.id, 1) : undefined })}
            />
          ))}
        </div>
      )}
      {examActions.dialogNode}
      {subjectActions.dialogNode}
    </>
  );
}
