import { Archive, ArchiveRestore, ArrowDown, ArrowUp, FolderOpen, MoveRight, Pencil, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog, type MenuItem } from '@/components/ui';
import { useDialogs } from '@/lib/dialogs';
import { toast } from '@/lib/toast';
import type { Subject } from '@/lib/types';
import { describeSubjectDeletion } from './deletionCopy';
import { MoveSubjectDialog } from './MoveSubjectDialog';
import { useDeleteSubject, useUpdateSubject } from './queries';

export interface SubjectMenuOptions {
  hideOpen?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDeleted?: () => void;
}

/** Shared subject actions (menu + confirmations) for the exam page and the subject workspace. */
export function useSubjectActions() {
  const nav = useNavigate();
  const dialogs = useDialogs();
  const update = useUpdateSubject();
  const del = useDeleteSubject();
  const [deleting, setDeleting] = useState<{ subject: Subject; onDeleted?: () => void } | null>(null);
  const [moving, setMoving] = useState<Subject | null>(null);

  const items = (subject: Subject, o: SubjectMenuOptions = {}): MenuItem[] => {
    const list: MenuItem[] = [];
    if (!o.hideOpen) list.push({ label: 'Open', icon: <FolderOpen size={16} />, onSelect: () => nav(`/subjects/${subject.id}`) });
    list.push({ label: 'Edit details', icon: <Pencil size={16} />, onSelect: () => dialogs.open({ kind: 'subject', examId: subject.examId, subject }) });
    list.push({ label: 'Move to another exam…', icon: <MoveRight size={16} />, onSelect: () => setMoving(subject) });
    list.push(
      subject.archived
        ? { label: 'Restore', icon: <ArchiveRestore size={16} />, onSelect: () => update.mutate({ id: subject.id, archived: false }, { onSuccess: () => toast.success(`“${subject.name}” restored`) }) }
        : { label: 'Archive', icon: <Archive size={16} />, onSelect: () => update.mutate({ id: subject.id, archived: true }, { onSuccess: () => toast.success(`“${subject.name}” archived`) }) },
    );
    if (o.onMoveUp) list.push({ label: 'Move up', icon: <ArrowUp size={16} />, onSelect: o.onMoveUp, separated: true });
    if (o.onMoveDown) list.push({ label: 'Move down', icon: <ArrowDown size={16} />, onSelect: o.onMoveDown });
    list.push({ label: 'Delete…', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: () => setDeleting({ subject, onDeleted: o.onDeleted }) });
    return list;
  };

  let dialogNode: ReactNode = null;
  if (deleting) {
    const d = describeSubjectDeletion(deleting.subject);
    dialogNode = (
      <ConfirmDialog
        title={`Delete “${deleting.subject.name}”?`}
        confirmLabel="Delete subject"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await del.mutateAsync(deleting.subject.id);
          toast.success(`“${deleting.subject.name}” deleted`);
          deleting.onDeleted?.();
        }}
      >
        <p>This can’t be undone. It will remove:</p>
        <ul>
          {d.removes.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p>{d.kept}</p>
      </ConfirmDialog>
    );
  } else if (moving) {
    dialogNode = <MoveSubjectDialog subject={moving} onClose={() => setMoving(null)} />;
  }
  return { items, dialogNode };
}
