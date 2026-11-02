import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextArea, TextField } from '@/components/ui';
import { todayKey } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { MockTest } from '@/lib/types';
import { useLogAttempt } from './queries';
import { fmtScore, platformOf, scoreFromCounts } from './resourceUtils';

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const isCount = (v: string) => v.trim() === '' || (Number.isInteger(Number(v)) && Number(v) >= 0);

/** Built to be filled in ~15 seconds right after a test: the score is the only required field. */
export function LogAttemptDialog({ test, onClose }: { test: MockTest; onClose: () => void }) {
  const [score, setScore] = useState('');
  const [scoreTouched, setScoreTouched] = useState(false);
  const [maxScore, setMaxScore] = useState(String(test.maxScore));
  const [correct, setCorrect] = useState('');
  const [wrong, setWrong] = useState('');
  const [skipped, setSkipped] = useState('');
  const [time, setTime] = useState('');
  const [date, setDate] = useState(todayKey());
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);
  const log = useLogAttempt();

  // Fill the score from correct/wrong until the student types a score themselves.
  const autoScore = scoreFromCounts(test, correct, wrong);
  const shownScore = scoreTouched || autoScore == null ? score : String(autoScore);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const s = num(shownScore);
    const max = num(maxScore);
    if (s == null || !Number.isFinite(s)) return setError('Enter your score');
    if (max == null || !Number.isFinite(max) || max <= 0) return setError('Enter the maximum score');
    if (s > max) return setError(`Score can’t be more than ${fmtScore(max)}`);
    if (![correct, wrong, skipped, time].every(isCount)) return setError('Counts and time must be whole numbers');
    try {
      await log.mutateAsync({ testId: test.id, score: s, maxScore: max, correct: num(correct), wrong: num(wrong), skipped: num(skipped), timeMinutes: num(time), reflection: reflection.trim() || null, attemptedOn: date || todayKey() });
      toast.success(`Logged ${fmtScore(s)}/${fmtScore(max)} for “${test.title}”`);
      onClose();
    } catch {
      /* the mutation already toasted the server's message; keep the form open */
    }
  };

  const marking = test.marksCorrect != null ? `+${test.marksCorrect} correct${test.marksWrong ? `, ${test.marksWrong} wrong` : ''}` : null;

  return (
    <Dialog
      title="Log attempt"
      description={
        <>
          {test.title} · {platformOf(test.url)}
          {test.attempts.length > 0 && ` · attempt #${test.attempts.length + 1}`}
        </>
      }
      onClose={onClose}
      busy={log.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={log.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="log-attempt" loading={log.isPending}>
            Save attempt
          </Button>
        </>
      }
    >
      <form id="log-attempt" className="form-grid" onSubmit={submit} noValidate>
        <div className="form-row">
          <TextField
            label="Score"
            type="number"
            inputMode="decimal"
            step="any"
            autoFocus
            value={shownScore}
            onChange={(e) => {
              setScoreTouched(true);
              setScore(e.target.value);
              setError(null);
            }}
            error={error}
            hint={autoScore != null && !scoreTouched ? `Calculated from your answers (${marking})` : marking ? `Or fill in correct / wrong below (${marking})` : 'Negative scores are allowed'}
          />
          <TextField label="Out of" type="number" inputMode="decimal" step="any" value={maxScore} onChange={(e) => (setMaxScore(e.target.value), setError(null))} />
        </div>
        <div className="form-row form-row-3">
          <TextField label="Correct" optional type="number" inputMode="numeric" min={0} value={correct} onChange={(e) => (setCorrect(e.target.value), setError(null))} />
          <TextField label="Wrong" optional type="number" inputMode="numeric" min={0} value={wrong} onChange={(e) => (setWrong(e.target.value), setError(null))} />
          <TextField label="Skipped" optional type="number" inputMode="numeric" min={0} value={skipped} onChange={(e) => (setSkipped(e.target.value), setError(null))} />
        </div>
        <div className="form-row">
          <TextField label="Time taken (min)" optional type="number" inputMode="numeric" min={0} placeholder={test.durationMinutes ? String(test.durationMinutes) : undefined} value={time} onChange={(e) => (setTime(e.target.value), setError(null))} />
          <TextField label="Date" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <TextArea label="What went wrong / what to fix" optional rows={3} maxLength={2000} placeholder="e.g. Spent too long on DI, guessed in GA" value={reflection} onChange={(e) => setReflection(e.target.value)} />
      </form>
    </Dialog>
  );
}
