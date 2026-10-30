import { ArrowRight, Check, CheckCircle2, GraduationCap, ListVideo, Sparkles, Video } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/layout/Brand';
import { Button, ErrorState, PageLoading, TextField } from '@/components/ui';
import { brand } from '@/config/brand';
import { useExams, useSubjects } from '@/features/common/queries';
import { useCreateExam } from '@/features/exams/queries';
import { useCreateSubject } from '@/features/subjects/queries';
import { useVideos } from '@/features/videos/queries';
import { useDialogs } from '@/lib/dialogs';
import { useDocumentTitle, useMeta, useProfile, useUpdateProfile } from '@/lib/hooks';
import { deriveOnboarding, SUBJECT_SUGGESTIONS } from './steps';
import './onboarding.css';

const STEP_LABELS = ['Welcome', 'Exam', 'Subject', 'Content', 'Finish'];

function Stepper({ current }: { current: number }) {
  return (
    <ol className="stepper" aria-label="Setup progress">
      {STEP_LABELS.map((label, i) => (
        <li key={label} className={i < current ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="step-dot">{i < current ? <Check size={13} aria-hidden /> : i + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OnboardingPage() {
  useDocumentTitle('Get started');
  const nav = useNavigate();
  const dialogs = useDialogs();
  const profile = useProfile();
  const exams = useExams();
  const subjects = useSubjects();
  const meta = useMeta();
  const updateProfile = useUpdateProfile();
  const createExam = useCreateExam();
  const createSubject = useCreateSubject();

  const [welcomed, setWelcomed] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const state = deriveOnboarding(exams.data ?? [], subjects.data ?? []);
  const lectures = useVideos({ subjectId: state.subject?.id, limit: 1 });

  if (profile.isError || exams.isError || subjects.isError) {
    return <ErrorState error={profile.error ?? exams.error ?? subjects.error} onRetry={() => (profile.refetch(), exams.refetch(), subjects.refetch())} />;
  }
  if (profile.isLoading || exams.isLoading || subjects.isLoading) return <PageLoading label="Preparing your setup…" />;

  const finish = async (to: string) => {
    try {
      await updateProfile.mutateAsync({ onboardingCompleted: true });
      nav(to);
    } catch {
      /* error toast shown by the mutation; stay here so they can retry */
    }
  };

  // Already onboarded (or an experienced user): offer a way out rather than re-running setup.
  if (profile.data?.onboardingCompleted && !finishing) {
    return (
      <div className="onboard">
        <div className="onboard-card center">
          <div className="empty-icon">
            <CheckCircle2 size={22} aria-hidden />
          </div>
          <h1>You're already set up</h1>
          <p className="page-desc">Your workspace is ready. Head to the dashboard, or add another exam.</p>
          <div className="row row-wrap">
            <Link to="/dashboard" className="btn btn-primary">
              Go to dashboard
            </Link>
            <Button onClick={() => dialogs.open({ kind: 'exam' })}>Add another exam</Button>
          </div>
        </div>
      </div>
    );
  }

  const showWelcome = state.step === 'exam' && !welcomed;
  const stepIndex = finishing ? 4 : showWelcome ? 0 : state.step === 'exam' ? 1 : state.step === 'subject' ? 2 : 3;
  const workspace = state.subject ? `/subjects/${state.subject.id}` : state.exam ? `/exams/${state.exam.id}` : '/dashboard';

  const submitExam = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give your exam a name, e.g. “CDS 2027”.');
    setError(null);
    try {
      await createExam.mutateAsync({ name: name.trim(), examDate: date || null });
    } catch {
      /* toast shown */
    }
  };
  const submitSubject = async (e: FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim()) return setError('Add a subject name, e.g. “Mathematics”.');
    if (!state.exam) return;
    setError(null);
    try {
      await createSubject.mutateAsync({ examId: state.exam.id, name: subjectName.trim() });
      setSubjectName('');
    } catch {
      /* toast shown */
    }
  };

  return (
    <div className="onboard">
      <Stepper current={stepIndex} />
      <div className="onboard-card">
        {showWelcome && (
          <section aria-labelledby="ob-h" className="center">
            <BrandMark size={52} />
            <h1 id="ob-h">Welcome to {brand.name}</h1>
            <p className="page-desc lead">{brand.tagline}</p>
            <p className="page-desc">In about a minute you'll set up your first exam and subject. You can add lectures now or later.</p>
            <div className="row row-wrap">
              <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => setWelcomed(true)}>
                Let's begin
              </Button>
              <Button variant="ghost" loading={updateProfile.isPending} onClick={() => finish('/dashboard')}>
                Skip setup
              </Button>
            </div>
          </section>
        )}

        {!showWelcome && !finishing && state.step === 'exam' && (
          <form onSubmit={submitExam} noValidate aria-labelledby="ob-h" className="form-grid">
            <div>
              <div className="eyebrow">Step 2 of 5</div>
              <h1 id="ob-h">What are you preparing for?</h1>
              <p className="page-desc">Create a workspace for your exam, like “CDS 2027” or “Personal learning”.</p>
            </div>
            <TextField label="Exam name" value={name} autoFocus maxLength={120} placeholder="CDS 2027" error={error} onChange={(e) => (setName(e.target.value), setError(null))} />
            <TextField label="Exam date" optional type="date" value={date} onChange={(e) => setDate(e.target.value)} hint="Used for the countdown on your dashboard." />
            <div className="row row-wrap">
              <Button type="submit" variant="primary" loading={createExam.isPending} icon={<GraduationCap size={16} />}>
                Create exam
              </Button>
              <Button variant="ghost" loading={updateProfile.isPending} onClick={() => finish('/dashboard')}>
                Skip setup
              </Button>
            </div>
          </form>
        )}

        {!finishing && state.step === 'subject' && state.exam && (
          <form onSubmit={submitSubject} noValidate aria-labelledby="ob-h" className="form-grid">
            <div>
              <div className="eyebrow">Step 3 of 5</div>
              <h1 id="ob-h">Add your first subject</h1>
              <p className="page-desc">
                Subjects organise <strong>{state.exam.name}</strong> — add the first now, more later.
              </p>
            </div>
            <TextField label="Subject name" value={subjectName} autoFocus maxLength={120} placeholder="Mathematics" error={error} onChange={(e) => (setSubjectName(e.target.value), setError(null))} />
            <div className="chips" role="group" aria-label="Suggestions">
              {SUBJECT_SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => (setSubjectName(s), setError(null))}>
                  {s}
                </button>
              ))}
            </div>
            <div className="row row-wrap">
              <Button type="submit" variant="primary" loading={createSubject.isPending}>
                Add subject
              </Button>
              <Button variant="ghost" loading={updateProfile.isPending} onClick={() => finish(`/exams/${state.exam!.id}`)}>
                Skip the rest
              </Button>
            </div>
          </form>
        )}

        {!finishing && state.step === 'content' && state.subject && (
          <section aria-labelledby="ob-h" className="form-grid">
            <div>
              <div className="eyebrow">Step 4 of 5 · optional</div>
              <h1 id="ob-h">Bring in some lectures</h1>
              <p className="page-desc">
                Import a YouTube playlist or add a single video to <strong>{state.subject.name}</strong>. You can do this any time.
              </p>
            </div>
            {(lectures.data?.total ?? 0) > 0 && (
              <p className="added-note" role="status">
                <CheckCircle2 size={16} aria-hidden /> {lectures.data!.total} {lectures.data!.total === 1 ? 'lecture' : 'lectures'} added to {state.subject.name}.
              </p>
            )}
            <div className="choice-grid">
              <button type="button" className="choice" onClick={() => dialogs.open({ kind: 'import', destination: { subjectId: state.subject!.id, folderId: null } })} disabled={meta.data?.features.youtubeImport === false}>
                <ListVideo size={20} aria-hidden />
                <b>Import a playlist</b>
                <span>{meta.data?.features.youtubeImport === false ? 'Needs a YouTube API key on the server' : 'Paste a YouTube playlist link'}</span>
              </button>
              <button type="button" className="choice" onClick={() => dialogs.open({ kind: 'video', destination: { subjectId: state.subject!.id, folderId: null } })}>
                <Video size={20} aria-hidden />
                <b>Add a single video</b>
                <span>Paste a YouTube video link</span>
              </button>
            </div>
            <div className="row row-wrap">
              <Button variant="primary" icon={<ArrowRight size={16} />} onClick={() => setFinishing(true)}>
                {(lectures.data?.total ?? 0) > 0 ? 'Continue' : 'Skip for now'}
              </Button>
            </div>
          </section>
        )}

        {finishing && (
          <section aria-labelledby="ob-h" className="center">
            <div className="empty-icon">
              <Sparkles size={22} aria-hidden />
            </div>
            <div className="eyebrow">Step 5 of 5</div>
            <h1 id="ob-h">You're all set</h1>
            <p className="page-desc">Your workspace is ready{state.exam ? ` for ${state.exam.name}` : ''}. Everything you add is saved to your account.</p>
            <Button variant="primary" loading={updateProfile.isPending} icon={<ArrowRight size={16} />} onClick={() => finish(workspace)}>
              Open my workspace
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
