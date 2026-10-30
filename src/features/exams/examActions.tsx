import { Archive, ArchiveRestore, ArrowDown, ArrowUp, CheckCircle2, Copy, FolderOpen, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog, Dialog, ErrorState, PageLoading, type MenuItem } from '@/components/ui';
import { useDialogs } from '@/lib/dialogs';
import { toast } from '@/lib/toast';
import type { Exam } from '@/lib/types';
import { describeExamDeletion } from './examUtils';
import { useDeleteExam, useDuplicateExam, useExam, useUpdateExam } from './queries';

/** Delete confirmation that loads the exam's real impact numbers first. */
function ExamDeleteConfirm({ exam, onClose, onDeleted }: { exam: Pick<Exam, 'id' | 'name'>; onClose: () => void; onDeleted?: () => void }) {
  const detail = useExam(exam.id);
  const del = useDeleteExam();
  if (detail.isError)
    return (
      <Dialog title="Delete exam?" size="sm" onClose={onClose}>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </Dialog>
    );
  if (!detail.data)
    return (
      <Dialog title="Delete exam?" size="sm" onClose={onClose}>
        <PageLoading label="Checking what’s inside…" />
      </Dialog>
    );
  const { removes, keeps } = describeExamDeletion(detail.data.impact);
  return (
    <ConfirmDialog
      title={`Delete “${exam.name}”?`}
      confirmLabel="Delete exam"
      danger
      onClose={onClose}
      onConfirm={async () => {
        await del.mutateAsync(exam.id);
        toast.success(`“${exam.name}” deleted`);
        onDeleted?.();
      }}
    >
      <p>This can’t be undone. It will remove:</p>
      <ul>
        {removes.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p>It will keep:</p>
      <ul>
        {keeps.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </ConfirmDialog>
  );
}

export interface ExamMenuOptions {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Hide "Open" when already on the exam's page. */
  hideOpen?: boolean;
  /** Called after deletion succeeds (e.g. navigate away). */
  onDeleted?: () => void;
}

/** Shared exam actions (menu + delete confirmation) for the list and detail pages. */
export function useExamActions() {
  const nav = useNavigate();
  const dialogs = useDialogs();
  const update = useUpdateExam();
  const duplicate = useDuplicateExam();
  const [deleting, setDeleting] = useState<{ exam: Pick<Exam, 'id' | 'name'>; onDeleted?: () => void } | null>(null);

  const setStatus = (exam: Exam, status: Exam['status'], message: string) =>
    update.mutate({ id: exam.id, status }, { onSuccess: () => toast.success(message) });

  const items = (exam: Exam, o: ExamMenuOptions = {}): MenuItem[] => {
    const list: MenuItem[] = [];
    if (!o.hideOpen) list.push({ label: 'Open', icon: <FolderOpen size={16} />, onSelect: () => nav(`/exams/${exam.id}`) });
    list.push({ label: 'Edit details', icon: <Pencil size={16} />, onSelect: () => dialogs.open({ kind: 'exam', exam }) });
    if (exam.status === 'COMPLETED') list.push({ label: 'Reopen', icon: <RotateCcw size={16} />, onSelect: () => setStatus(exam, 'ACTIVE', `“${exam.name}” is active again`) });
    else if (exam.status === 'ACTIVE') list.push({ label: 'Mark completed', icon: <CheckCircle2 size={16} />, onSelect: () => setStatus(exam, 'COMPLETED', `“${exam.name}” marked completed`) });
    if (exam.status === 'ARCHIVED') list.push({ label: 'Restore', icon: <ArchiveRestore size={16} />, onSelect: () => setStatus(exam, 'ACTIVE', `“${exam.name}” restored`) });
    else list.push({ label: 'Archive', icon: <Archive size={16} />, onSelect: () => setStatus(exam, 'ARCHIVED', `“${exam.name}” archived`) });
    list.push({
      label: 'Duplicate structure',
      icon: <Copy size={16} />,
      onSelect: () => duplicate.mutate(exam.id, { onSuccess: (copy) => toast.success(`Created “${copy.name}” with the same subjects and folders`) }),
    });
    if (o.onMoveUp) list.push({ label: 'Move up', icon: <ArrowUp size={16} />, onSelect: o.onMoveUp, separated: true });
    if (o.onMoveDown) list.push({ label: 'Move down', icon: <ArrowDown size={16} />, onSelect: o.onMoveDown });
    list.push({ label: 'Delete…', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: () => setDeleting({ exam, onDeleted: o.onDeleted }) });
    return list;
  };

  const dialogNode: ReactNode = deleting ? <ExamDeleteConfirm exam={deleting.exam} onClose={() => setDeleting(null)} onDeleted={deleting.onDeleted} /> : null;
  return { items, setStatus, dialogNode, requestDelete: (exam: Pick<Exam, 'id' | 'name'>, onDeleted?: () => void) => setDeleting({ exam, onDeleted }) };
}
