import { useState, type FormEvent } from 'react';
import { Button, Dialog, SelectField, TextField } from '@/components/ui';
import { toast } from '@/lib/toast';
import type { ExamLink, LinkCategory, MockTest, MockTestType } from '@/lib/types';
import { useUpdateLink, useUpdateMockTest } from './queries';
import { CATEGORY_LABEL, MOCK_TYPE_LABEL, parseUrls } from './resourceUtils';

const optNum = (v: string) => (v.trim() === '' ? null : Number(v));

function Footer({ busy, onClose, form }: { busy: boolean; onClose: () => void; form: string }) {
  return (
    <>
      <Button onClick={onClose} disabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" type="submit" form={form} loading={busy}>
        Save changes
      </Button>
    </>
  );
}

export function EditLinkDialog({ link, onClose }: { link: ExamLink; onClose: () => void }) {
  const [title, setTitle] = useState(link.title);
  const [url, setUrl] = useState(link.url);
  const [category, setCategory] = useState<LinkCategory>(link.category);
  const [error, setError] = useState<{ field: 'title' | 'url'; message: string } | null>(null);
  const update = useUpdateLink();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = parseUrls(url)[0];
    if (!title.trim()) return setError({ field: 'title', message: 'Give the link a title' });
    if (!clean) return setError({ field: 'url', message: 'Enter a full link, e.g. https://…' });
    try {
      await update.mutateAsync({ id: link.id, title: title.trim(), url: clean, category });
      toast.success('Link updated');
      onClose();
    } catch {
      /* toasted */
    }
  };

  return (
    <Dialog title="Edit link" onClose={onClose} size="sm" busy={update.isPending} footer={<Footer busy={update.isPending} onClose={onClose} form="edit-link" />}>
      <form id="edit-link" className="form-grid" onSubmit={submit} noValidate>
        <TextField label="Title" value={title} maxLength={200} autoFocus onChange={(e) => (setTitle(e.target.value), setError(null))} error={error?.field === 'title' ? error.message : null} />
        <TextField label="Link" type="url" value={url} maxLength={2048} onChange={(e) => (setUrl(e.target.value), setError(null))} error={error?.field === 'url' ? error.message : null} />
        <SelectField label="Category" value={category} onChange={(e) => setCategory(e.target.value as LinkCategory)}>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
      </form>
    </Dialog>
  );
}

export function EditMockTestDialog({ test, onClose }: { test: MockTest; onClose: () => void }) {
  const [title, setTitle] = useState(test.title);
  const [url, setUrl] = useState(test.url);
  const [testType, setTestType] = useState<MockTestType>(test.testType);
  const [maxScore, setMaxScore] = useState(String(test.maxScore));
  const [duration, setDuration] = useState(test.durationMinutes ? String(test.durationMinutes) : '');
  const [marksCorrect, setMarksCorrect] = useState(test.marksCorrect != null ? String(test.marksCorrect) : '');
  const [marksWrong, setMarksWrong] = useState(test.marksWrong != null ? String(Math.abs(test.marksWrong)) : '');
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateMockTest();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = parseUrls(url)[0];
    const max = Number(maxScore);
    const dur = optNum(duration);
    const mc = optNum(marksCorrect);
    const mw = optNum(marksWrong);
    if (!title.trim()) return setError('Give the test a title');
    if (!clean) return setError('Enter a full link, e.g. https://…');
    if (!(max > 0)) return setError('Maximum score must be above 0');
    if (dur != null && !(Number.isInteger(dur) && dur > 0)) return setError('Duration must be a whole number of minutes');
    if ((mc != null && !(mc > 0)) || (mw != null && !(mw >= 0))) return setError('Marks must be positive numbers');
    try {
      await update.mutateAsync({ id: test.id, title: title.trim(), url: clean, testType, maxScore: max, durationMinutes: dur, marksCorrect: mc, marksWrong: mc != null && mw != null ? -mw : null });
      toast.success('Mock test updated');
      onClose();
    } catch {
      /* toasted */
    }
  };

  return (
    <Dialog title="Edit mock test" description="Past attempts keep the score they were logged with." onClose={onClose} busy={update.isPending} footer={<Footer busy={update.isPending} onClose={onClose} form="edit-test" />}>
      <form id="edit-test" className="form-grid" onSubmit={submit} noValidate>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <TextField label="Title" value={title} maxLength={200} autoFocus onChange={(e) => (setTitle(e.target.value), setError(null))} />
        <TextField label="Link" type="url" value={url} maxLength={2048} onChange={(e) => (setUrl(e.target.value), setError(null))} />
        <div className="form-row form-row-3">
          <SelectField label="Type" value={testType} onChange={(e) => setTestType(e.target.value as MockTestType)}>
            {Object.entries(MOCK_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
          <TextField label="Max score" type="number" inputMode="decimal" step="any" min={1} value={maxScore} onChange={(e) => (setMaxScore(e.target.value), setError(null))} />
          <TextField label="Minutes" optional type="number" inputMode="numeric" min={1} value={duration} onChange={(e) => (setDuration(e.target.value), setError(null))} />
        </div>
        <div className="form-row">
          <TextField label="Marks per correct" optional type="number" inputMode="decimal" step="any" min={0} value={marksCorrect} onChange={(e) => (setMarksCorrect(e.target.value), setError(null))} />
          <TextField label="Marks lost per wrong" optional type="number" inputMode="decimal" step="any" min={0} value={marksWrong} onChange={(e) => (setMarksWrong(e.target.value), setError(null))} />
        </div>
      </form>
    </Dialog>
  );
}
