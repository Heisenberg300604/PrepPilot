import { useState } from 'react';
import { Button, Dialog, SelectField } from '@/components/ui';
import { useExams } from '@/features/common/queries';
import { toast } from '@/lib/toast';
import type { Subject } from '@/lib/types';
import { useUpdateSubject } from './queries';

/** Moves a subject (with its folders and filed content) to a different exam. */
export function MoveSubjectDialog({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const exams = useExams();
  const update = useUpdateSubject();
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = (exams.data ?? []).filter((e) => e.id !== subject.examId && e.status !== 'ARCHIVED');

  const submit = async () => {
    if (!target) return setError('Choose the exam to move this subject to.');
    try {
      await update.mutateAsync({ id: subject.id, examId: target });
      toast.success(`“${subject.name}” moved to ${options.find((e) => e.id === target)?.name}`);
      onClose();
    } catch {
      /* toasted */
    }
  };
  return (
    <Dialog
      title={`Move “${subject.name}”`}
      description="Its folders, playlists, videos and progress move with it."
      size="sm"
      onClose={onClose}
      busy={update.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={update.isPending} disabled={options.length === 0}>
            Move subject
          </Button>
        </>
      }
    >
      <SelectField label="Move to exam" value={target} error={error} onChange={(e) => (setTarget(e.target.value), setError(null))} hint={options.length === 0 && !exams.isLoading ? 'You have no other exams to move this into.' : undefined}>
        <option value="">Choose an exam…</option>
        {options.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </SelectField>
    </Dialog>
  );
}
