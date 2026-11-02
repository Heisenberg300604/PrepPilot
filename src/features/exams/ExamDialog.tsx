import { Check, Ban } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextArea, TextField } from '@/components/ui';
import { toast } from '@/lib/toast';
import type { Exam } from '@/lib/types';
import { EXAM_COLORS } from './examUtils';
import { EXAM_ICONS } from './examIcons';
import { useCreateExam, useUpdateExam } from './queries';
import './exams.css';

export function ColorPicker({ value, onChange, legend = 'Colour' }: { value: string | null; onChange: (c: string | null) => void; legend?: string }) {
  return (
    <fieldset className="swatches">
      <legend>
        {legend} <span className="field-optional">(optional)</span>
      </legend>
      <div className="swatch-row">
        <label className="swatch swatch-none">
          <input type="radio" name="colour" checked={value === null} onChange={() => onChange(null)} aria-label="No colour" />
          <span className="swatch-dot">
            <Ban size={14} aria-hidden />
          </span>
        </label>
        {EXAM_COLORS.map((c) => (
          <label key={c.value} className="swatch" style={{ ['--swatch' as string]: c.value }}>
            <input type="radio" name="colour" checked={value === c.value} onChange={() => onChange(c.value)} aria-label={c.name} />
            <span className="swatch-dot">{value === c.value && <Check size={15} aria-hidden />}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function IconPicker({ value, onChange, color }: { value: string | null; onChange: (key: string | null) => void; color: string | null }) {
  return (
    <fieldset className="swatches">
      <legend>
        Icon <span className="field-optional">(optional)</span>
      </legend>
      <div className="icon-grid" style={color ? ({ ['--swatch' as string]: color } as React.CSSProperties) : undefined}>
        {EXAM_ICONS.map(({ key, name, icon: Icon }) => {
          const checked = (value ?? 'graduation-cap') === key;
          return (
            <label key={key} className="icon-choice" title={name}>
              <input type="radio" name="exam-icon" checked={checked} onChange={() => onChange(key === 'graduation-cap' ? null : key)} aria-label={name} />
              <span className="icon-choice-tile">
                <Icon size={18} aria-hidden />
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function ExamDialog({ exam, onClose }: { exam?: Exam | null; onClose: () => void }) {
  const editing = Boolean(exam);
  const [name, setName] = useState(exam?.name ?? '');
  const [description, setDescription] = useState(exam?.description ?? '');
  const [examDate, setExamDate] = useState(exam?.examDate ?? '');
  const [color, setColor] = useState<string | null>(exam?.color ?? null);
  const [icon, setIcon] = useState<string | null>(exam?.icon ?? null);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateExam();
  const update = useUpdateExam();
  const busy = create.isPending || update.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Give your exam a name, e.g. “CDS 2027”.');
    if (trimmed.length > 120) return setError('Keep the name under 120 characters.');
    const body = { name: trimmed, description: description.trim() || null, examDate: examDate || null, color, icon };
    try {
      if (exam) await update.mutateAsync({ id: exam.id, ...body });
      else await create.mutateAsync(body);
      toast.success(editing ? 'Exam updated' : `“${trimmed}” created`);
      onClose();
    } catch {
      /* the mutation already toasted the server's message; keep the form open for another try */
    }
  };

  return (
    <Dialog
      title={editing ? 'Edit exam' : 'Create an exam'}
      description={editing ? undefined : 'An exam is a workspace for one goal. You can add subjects, folders and lectures next.'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="exam-form" loading={busy}>
            {editing ? 'Save changes' : 'Create exam'}
          </Button>
        </>
      }
    >
      <form id="exam-form" className="form-grid" onSubmit={submit} noValidate>
        <TextField label="Exam name" value={name} onChange={(e) => (setName(e.target.value), setError(null))} error={error} autoFocus maxLength={120} placeholder="CDS 2027" required />
        <TextArea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder="What are you preparing for?" />
        <TextField label="Exam date" optional type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
        <IconPicker value={icon} onChange={setIcon} color={color} />
        <ColorPicker value={color} onChange={setColor} />
      </form>
    </Dialog>
  );
}
