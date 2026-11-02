import { AlertTriangle, ClipboardCheck, Link2, X } from 'lucide-react';
import { useState } from 'react';
import { Button, Dialog, IconButton, TextArea, TextField } from '@/components/ui';
import { plural } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { ExamResources, LinkCategory, MockTestType } from '@/lib/types';
import { useAddResources } from './queries';
import { CATEGORY_LABEL, MOCK_TYPE_LABEL, defaultsFor, detectUrl, domainOf, isSavedAlready, parseUrls, platformOf } from './resourceUtils';
import { SiteMark } from './SiteMark';

interface Draft {
  url: string;
  kind: 'LINK' | 'MOCK';
  title: string;
  category: LinkCategory;
  testType: MockTestType;
  maxScore: string;
  duration: string;
  duplicate: boolean;
}

const MAX_ITEMS = 50;
const optNum = (v: string) => (v.trim() === '' ? null : Number(v));

/** Two steps: paste any number of URLs → review the auto-detected kind/title → save in one request. */
export function AddResourcesDialog({ examId, existing, defaultKind, onClose }: { examId: string; existing?: ExamResources; defaultKind?: 'LINK' | 'MOCK'; onClose: () => void }) {
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const tests = existing?.tests ?? [];
  const seed = defaultsFor(tests, 'FULL');
  const [marksCorrect, setMarksCorrect] = useState(seed.marksCorrect != null ? String(seed.marksCorrect) : '');
  const [marksWrong, setMarksWrong] = useState(seed.marksWrong != null ? String(Math.abs(seed.marksWrong)) : '');
  const [error, setError] = useState<string | null>(null);
  const add = useAddResources(examId);

  const urls = parseUrls(text);
  const review = () => {
    if (!urls.length) return setError('Paste at least one full link, e.g. https://…');
    if (urls.length > MAX_ITEMS) return setError(`Add up to ${MAX_ITEMS} links at a time.`);
    setDrafts(
      urls.map((url) => {
        const d = detectUrl(url);
        const def = defaultsFor(tests, d.testType);
        return { url, kind: defaultKind ?? d.kind, title: d.title, category: d.category, testType: d.testType, maxScore: String(def.maxScore), duration: def.durationMinutes ? String(def.durationMinutes) : '', duplicate: isSavedAlready(url, existing) };
      }),
    );
  };
  const patch = (i: number, p: Partial<Draft>) => {
    setError(null);
    setDrafts((ds) => ds!.map((d, j) => (j === i ? { ...d, ...p } : d)));
  };

  const save = async () => {
    const ds = drafts!;
    if (ds.some((d) => !d.title.trim())) return setError('Every item needs a title.');
    const mocks = ds.filter((d) => d.kind === 'MOCK');
    if (mocks.some((d) => !(Number(d.maxScore) > 0))) return setError('Each mock test needs a maximum score above 0.');
    if (mocks.some((d) => d.duration.trim() !== '' && !(Number.isInteger(Number(d.duration)) && Number(d.duration) > 0))) return setError('Duration must be a whole number of minutes.');
    const mc = optNum(marksCorrect);
    const mw = optNum(marksWrong);
    if ((mc != null && !(mc > 0)) || (mw != null && !(mw >= 0))) return setError('Marks must be positive numbers.');
    const links = ds.filter((d) => d.kind === 'LINK').map((d) => ({ title: d.title.trim(), url: d.url, category: d.category }));
    const newTests = mocks.map((d) => ({ title: d.title.trim(), url: d.url, testType: d.testType, maxScore: Number(d.maxScore), durationMinutes: optNum(d.duration), marksCorrect: mc, marksWrong: mc != null && mw != null ? -mw : null }));
    try {
      await add.mutateAsync({ links, tests: newTests });
      toast.success([links.length && plural(links.length, 'link'), newTests.length && plural(newTests.length, 'mock test')].filter(Boolean).join(' and ') + ' added');
      onClose();
    } catch {
      /* toasted by the mutation */
    }
  };

  const hasMocks = drafts?.some((d) => d.kind === 'MOCK');

  return (
    <Dialog
      title={drafts ? `Review ${plural(drafts.length, 'item')}` : 'Add links & mock tests'}
      description={drafts ? 'We guessed what each one is. Fix anything that looks off.' : 'Paste one link, or a whole test series with one link per line.'}
      size={drafts ? 'lg' : 'md'}
      onClose={onClose}
      busy={add.isPending}
      footer={
        drafts ? (
          <>
            <Button onClick={() => (setDrafts(null), setError(null))} disabled={add.isPending}>
              Back
            </Button>
            <Button variant="primary" onClick={save} disabled={!drafts.length} loading={add.isPending}>
              Add {plural(drafts.length, 'item')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={review} disabled={!urls.length}>
              {urls.length > 1 ? `Continue with ${urls.length} links` : 'Continue'}
            </Button>
          </>
        )
      }
    >
      {!drafts ? (
        <TextArea
          label="Links"
          rows={6}
          autoFocus
          value={text}
          onChange={(e) => (setText(e.target.value), setError(null))}
          placeholder={'https://afcat.cdac.in/AFCAT/\nhttps://www.prephub.in/afcat/mock-test-5\nhttps://www.prephub.in/afcat/mock-test-6'}
          error={error}
          hint="Official pages, PDFs, notes, or mock tests from PrepHub, Testbook and similar sites."
        />
      ) : (
        <div className="form-grid">
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <ul className="draft-list">
            {drafts.map((d, i) => (
              <li key={d.url} className="draft">
                <SiteMark url={d.url} />
                <div className="draft-main">
                  <input className="input" aria-label={`Title for ${d.url}`} value={d.title} maxLength={200} onChange={(e) => patch(i, { title: e.target.value })} />
                  <div className="vrow-meta">
                    <span className="truncate">{domainOf(d.url)}</span>
                    {d.duplicate && (
                      <span className="badge badge-warn">
                        <AlertTriangle size={12} aria-hidden /> Already saved
                      </span>
                    )}
                  </div>
                  <div className="draft-controls">
                    <div className="segmented" role="group" aria-label="Type">
                      <button type="button" className={d.kind === 'LINK' ? 'selected' : ''} aria-pressed={d.kind === 'LINK'} onClick={() => patch(i, { kind: 'LINK' })}>
                        <Link2 size={14} aria-hidden /> Link
                      </button>
                      <button type="button" className={d.kind === 'MOCK' ? 'selected' : ''} aria-pressed={d.kind === 'MOCK'} onClick={() => patch(i, { kind: 'MOCK' })}>
                        <ClipboardCheck size={14} aria-hidden /> Mock test
                      </button>
                    </div>
                    {d.kind === 'LINK' ? (
                      <select className="input select input-sm" aria-label="Category" value={d.category} onChange={(e) => patch(i, { category: e.target.value as LinkCategory })}>
                        {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <>
                        <select
                          className="input select input-sm"
                          aria-label="Test type"
                          value={d.testType}
                          onChange={(e) => {
                            const testType = e.target.value as MockTestType;
                            const def = defaultsFor(tests, testType);
                            patch(i, { testType, maxScore: String(def.maxScore), duration: def.durationMinutes ? String(def.durationMinutes) : d.duration });
                          }}
                        >
                          {Object.entries(MOCK_TYPE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <label className="draft-max">
                          Max
                          <input className="input input-sm" type="number" inputMode="decimal" min={1} value={d.maxScore} onChange={(e) => patch(i, { maxScore: e.target.value })} />
                        </label>
                        <label className="draft-max">
                          Min
                          <input className="input input-sm" type="number" inputMode="numeric" min={1} placeholder="—" aria-label="Duration in minutes" value={d.duration} onChange={(e) => patch(i, { duration: e.target.value })} />
                        </label>
                        <span className="draft-platform">{platformOf(d.url)}</span>
                      </>
                    )}
                  </div>
                </div>
                <IconButton label={`Remove ${d.title || d.url}`} onClick={() => setDrafts((ds) => ds!.filter((_, j) => j !== i))}>
                  <X size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
          {hasMocks && (
            <fieldset className="swatches">
              <legend>
                Marking scheme <span className="field-optional">(optional, lets us calculate your score from correct / wrong answers)</span>
              </legend>
              <div className="form-row">
                <TextField label="Marks per correct" type="number" inputMode="decimal" step="any" min={0} placeholder="e.g. 3" value={marksCorrect} onChange={(e) => (setMarksCorrect(e.target.value), setError(null))} />
                <TextField label="Marks lost per wrong" type="number" inputMode="decimal" step="any" min={0} placeholder="e.g. 1" value={marksWrong} onChange={(e) => (setMarksWrong(e.target.value), setError(null))} />
              </div>
            </fieldset>
          )}
        </div>
      )}
    </Dialog>
  );
}
