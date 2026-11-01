import { SignInButton, SignUpButton } from '@clerk/clerk-react';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronRight,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  ListVideo,
  NotebookPen,
  PlayCircle,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '@/components/layout/Brand';
import { Button } from '@/components/ui';
import { brand } from '@/config/brand';
import { useDocumentTitle } from '@/lib/hooks';
import './landing.css';

const features = [
  { icon: FolderTree, title: 'A place for every lecture', text: 'Exams, subjects and nested folders mirror how you actually study.' },
  { icon: PlayCircle, title: 'YouTube, organised', text: 'Import a playlist or add single videos and study them in a distraction-free player.' },
  { icon: Target, title: 'Honest progress', text: 'Completion is counted once per lecture — no matter how many folders it lives in.' },
  { icon: NotebookPen, title: 'Notes that stay', text: 'Write notes beside each video and pick up from where you paused.' },
  { icon: CalendarCheck2, title: 'A plan for today', text: 'Set a daily target, schedule sessions and see what is overdue.' },
  { icon: BookOpenCheck, title: 'Yours, privately', text: 'Your library is private to your account and never shared.' },
];

const steps = [
  { title: 'Map your syllabus', text: 'Create an exam, add its subjects and nest folders as deep as your syllabus goes.' },
  { title: 'Bring in your lectures', text: 'Import a YouTube playlist — keeping only the videos you want — or paste a single video link.' },
  { title: 'Study and track', text: 'Watch in a focused player, keep notes beside the video, resume where you paused and tick lectures off.' },
];

const details = [
  'Search everything with Ctrl / ⌘ K',
  'Re-sync playlists without losing progress or notes',
  'Videos you remove stay removed after a sync',
  'File one lecture in several places without duplicates',
  'Light and dark themes',
  'Works on phone, tablet and desktop',
];

/** Illustrative product preview built from the app's own visual language (sample data, not a screenshot). */
function ProductPreview() {
  const rows = [
    { title: 'Quadratic equations — full lecture', meta: '48:12', status: 'done' as const },
    { title: 'Linear inequalities in one sitting', meta: '36:40', status: 'progress' as const },
    { title: 'Progressions: AP and GP', meta: '52:05', status: 'todo' as const },
    { title: 'Logarithms practice set', meta: '29:18', status: 'todo' as const },
  ];
  const label = { done: 'Completed', progress: 'In progress', todo: 'Not started' };
  return (
    <div className="lp-preview" role="img" aria-label="Preview of a PrepPilot subject page: an Algebra folder with lecture progress, and today's study plan">
      <div className="lp-window">
        <div className="lp-window-bar">
          <span className="lp-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="lp-window-url">PrepPilot</span>
        </div>
        <div className="lp-app">
          <aside className="lp-side">
            {[
              { icon: LayoutDashboard, label: 'Dashboard' },
              { icon: GraduationCap, label: 'My exams', active: true },
              { icon: LibraryBig, label: 'Library' },
              { icon: CalendarDays, label: 'Planner' },
            ].map(({ icon: Icon, label: l, active }) => (
              <span key={l} className={`lp-side-item ${active ? 'is-active' : ''}`}>
                <Icon size={15} /> {l}
              </span>
            ))}
          </aside>
          <div className="lp-main">
            <div className="lp-crumbs">
              CDS 2027 <ChevronRight size={13} /> Mathematics <ChevronRight size={13} /> <strong>Algebra</strong>
            </div>
            <div className="lp-head">
              <div>
                <div className="lp-title">Algebra</div>
                <div className="lp-sub">
                  <ListVideo size={13} /> 1 playlist · 18 lectures
                </div>
              </div>
              <div className="lp-pct">62%</div>
            </div>
            <div className="lp-bar">
              <span style={{ width: '62%' }} />
            </div>
            <ul className="lp-rows">
              {rows.map((r, i) => (
                <li key={r.title} className="lp-row">
                  <span className={`lp-check is-${r.status}`}>{r.status === 'done' && <Check size={12} strokeWidth={3} />}</span>
                  <span className={`lp-thumb t${i}`}>
                    <PlayCircle size={14} />
                  </span>
                  <span className="lp-row-text">
                    <span className="lp-row-title">{r.title}</span>
                    <span className="lp-row-meta">
                      <span className={`lp-badge is-${r.status}`}>{label[r.status]}</span> {r.meta}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="lp-today">
            <div className="lp-today-head">Today</div>
            <div className="lp-ring" style={{ ['--p' as string]: '0.6' }}>
              <span>
                <strong>54</strong>/90 min
              </span>
            </div>
            {[
              { t: 'Finish linear inequalities', done: true },
              { t: 'Revise algebra notes', done: false },
              { t: 'Mock test: arithmetic', done: false },
            ].map((task) => (
              <div key={task.t} className={`lp-task ${task.done ? 'is-done' : ''}`}>
                <span className="lp-task-box">{task.done && <Check size={10} strokeWidth={3} />}</span>
                {task.t}
              </div>
            ))}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The signed-out home page. */
export function Landing() {
  useDocumentTitle();
  return (
    <div className="landing">
      <a className="skip-link" href="#lp-content">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Brand />
          <nav className="lp-nav-links" aria-label="Landing page">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
          </nav>
          <div className="lp-nav-actions">
            <SignInButton mode="redirect">
              <Button variant="ghost" className="lp-signin">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="redirect">
              <Button variant="primary">Get started</Button>
            </SignUpButton>
          </div>
        </div>
      </header>

      <main id="lp-content">
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-glow" aria-hidden />
          <p className="lp-eyebrow">
            <GraduationCap size={15} aria-hidden /> For exam aspirants and self-learners
          </p>
          <h1 id="lp-hero-title">
            Your preparation. <span className="lp-accent">Your pace.</span> Your progress.
          </h1>
          <p className="lp-hero-sub">{brand.description}</p>
          <div className="lp-hero-actions">
            <SignUpButton mode="redirect">
              <Button variant="primary" className="lp-cta">
                Create your free workspace
                <ArrowRight size={17} aria-hidden />
              </Button>
            </SignUpButton>
            <SignInButton mode="redirect">
              <Button className="lp-cta">I already have an account</Button>
            </SignInButton>
          </div>
          <p className="lp-hero-note">
            <ShieldCheck size={15} aria-hidden />
            <span>PrepPilot organises videos by their official YouTube links and embedded player. It never downloads or rehosts content.</span>
          </p>
          <ProductPreview />
        </section>

        <section id="how-it-works" className="lp-section" aria-labelledby="lp-how-title">
          <div className="lp-section-head">
            <p className="lp-kicker">How it works</p>
            <h2 id="lp-how-title">From scattered links to a study plan in minutes</h2>
          </div>
          <ol className="lp-steps">
            {steps.map((s, i) => (
              <li key={s.title} className="lp-step">
                <span className="lp-step-num" aria-hidden>
                  {i + 1}
                </span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="features" className="lp-section" aria-label="Features">
          <div className="lp-section-head">
            <p className="lp-kicker">Features</p>
            <h2>Everything your preparation needs, in one calm workspace</h2>
          </div>
          <div className="lp-features">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="lp-feature">
                <div className="lp-feature-icon">
                  <Icon size={20} aria-hidden />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <ul className="lp-details" aria-label="Also included">
            {details.map((d) => (
              <li key={d}>
                <Check size={16} aria-hidden /> {d}
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section">
          <div className="lp-final">
            <h2>Start your next study session with a plan</h2>
            <p>Set up your first exam in a couple of minutes. Your library stays private to your account.</p>
            <SignUpButton mode="redirect">
              <Button variant="primary" className="lp-cta lp-cta-invert">
                Start for free
                <ArrowRight size={17} aria-hidden />
              </Button>
            </SignUpButton>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-inner">
          <div className="lp-foot-brand">
            <Brand />
            <p>{brand.tagline}</p>
          </div>
          <nav className="lp-foot-links" aria-label="Footer">
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <Link to="/sign-in">Sign in</Link>
            <Link to="/sign-up">Create account</Link>
          </nav>
        </div>
        <div className="lp-foot-legal">
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          <span>YouTube is a trademark of Google LLC. {brand.name} is not affiliated with YouTube.</span>
        </div>
      </footer>
    </div>
  );
}
