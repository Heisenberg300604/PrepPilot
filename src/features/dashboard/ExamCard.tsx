import { Archive, ArrowUpRight, MoreHorizontal, Pencil } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Progress } from '@/components/ui';
import { useUpdateExam } from '@/features/exams/queries';
import { useDialogs } from '@/lib/dialogs';
import { daysUntil, formatDate, plural } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { Exam } from '@/lib/types';

export function examCountdown(examDate: string | null, today: string): string | null {
  if (!examDate) return null;
  const d = daysUntil(examDate, today);
  if (d === 0) return 'Exam is today';
  if (d === 1) return '1 day left';
  if (d > 1) return `${d} days left`;
  return 'Exam date has passed';
}

export function ExamCard({ exam, today }: { exam: Exam; today: string }) {
  const dialogs = useDialogs();
  const nav = useNavigate();
  const update = useUpdateExam();
  const countdown = examCountdown(exam.examDate, today);
  const archive = () =>
    update.mutate(
      { id: exam.id, status: 'ARCHIVED' },
      {
        onSuccess: () =>
          toast.success(`“${exam.name}” archived`, {
            label: 'Undo',
            onClick: () => update.mutate({ id: exam.id, status: 'ACTIVE' }),
          }),
      },
    );
  return (
    <article className="exam-card">
      <div className="exam-card-top">
        <span className="exam-emblem" style={exam.color ? { background: exam.color } : undefined} aria-hidden />
        <Menu
          label={`Actions for ${exam.name}`}
          trigger={<MoreHorizontal size={18} />}
          items={[
            { label: 'Open workspace', icon: <ArrowUpRight size={16} />, onSelect: () => nav(`/exams/${exam.id}`) },
            { label: 'Edit exam', icon: <Pencil size={16} />, onSelect: () => dialogs.open({ kind: 'exam', exam }) },
            { label: 'Archive', icon: <Archive size={16} />, onSelect: archive, separated: true },
          ]}
        />
      </div>
      <h3>
        <Link to={`/exams/${exam.id}`} className="exam-card-link">
          {exam.name}
        </Link>
      </h3>
      <p className="muted exam-card-sub">
        {plural(exam.subjectCount, 'subject')} · {plural(exam.stats.total, 'video')}
      </p>
      <div className="exam-card-progress">
        <span>Progress</span>
        <strong>{exam.stats.percent}%</strong>
      </div>
      <Progress value={exam.stats.percent} label={`${exam.name} progress`} />
      <p className="exam-card-foot">
        {exam.examDate ? (
          <>
            <span>{formatDate(exam.examDate)}</span>
            {countdown && <span className="exam-countdown">{countdown}</span>}
          </>
        ) : (
          <span className="muted">No exam date set</span>
        )}
      </p>
    </article>
  );
}
