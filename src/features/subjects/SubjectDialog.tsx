import { useState, type FormEvent } from 'react';
import { Button, Dialog, SelectField, TextArea, TextField } from '@/components/ui';
import { ColorPicker } from '@/features/exams/ExamDialog';
import { useExams } from '@/features/common/queries';
import { toast } from '@/lib/toast';
import type { Subject } from '@/lib/types';
import { useCreateSubject, useUpdateSubject } from './queries';

export default function SubjectDialog({ examId, subject, onClose }: { examId?: string; subject?: Subject | null; onClose: () => void }) {
  const editing = Boolean(subject);
  const needsExam = !editing && !examId;
  const exams = useExams();
  const [chosenExam, setChosenExam] = useState(examId ?? '');
  const [name, setName] = useState(subject?.name ?? '');
  const [description, setDescription] = useState(subject?.description ?? '');
  const [color, setColor] = useState<string | null>(subject?.color ?? null);
  const [errors, setErrors] = useState<{ name?: string; exam?: string }>({});
  const create = useCreateSubject();
  const update = useUpdateSubject();
  const busy = create.isPending || update.isPending;
  const selectable = (exams.data ?? []).filter((e) => e.status !== 'ARCHIVED');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const next: typeof errors = {};
    if (!trimmed) next.name = 'Give the subject a name, e.g. “Mathematics”.';
    if (needsExam && !chosenExam) next.exam = 'Choose which exam this subject belongs to.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = { name: trimmed, description: description.trim() || null, color };
    try {
      if (subject) await update.mutateAsync({ id: subject.id, ...body });
      else await create.mutateAsync({ examId: chosenExam, ...body });
      toast.success(editing ? 'Subject updated' : `“${trimmed}” added`);
      onClose();
    } catch {
      /* error already toasted */
    }
  };

  return (
    <Dialog
      title={editing ? 'Edit subject' : 'Add a subject'}
      description={editing ? undefined : 'Subjects hold the folders, playlists and lectures for one area of study.'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="subject-form" loading={busy}>
            {editing ? 'Save changes' : 'Add subject'}
          </Button>
        </>
      }
    >
      <form id="subject-form" className="form-grid" onSubmit={submit} noValidate>
        {needsExam && (
          <SelectField label="Exam" value={chosenExam} error={errors.exam} onChange={(e) => (setChosenExam(e.target.value), setErrors((x) => ({ ...x, exam: undefined })))}>
            <option value="">{exams.isLoading ? 'Loading…' : selectable.length ? 'Choose an exam…' : 'Create an exam first'}</option>
            {selectable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="Subject name" value={name} onChange={(e) => (setName(e.target.value), setErrors((x) => ({ ...x, name: undefined })))} error={errors.name} autoFocus={!needsExam} maxLength={120} placeholder="Mathematics" required />
        <TextArea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        <ColorPicker value={color} onChange={setColor} />
      </form>
    </Dialog>
  );
}
