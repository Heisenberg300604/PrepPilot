import { SignInButton, SignUpButton } from '@clerk/clerk-react';
import { BookOpenCheck, CalendarCheck2, FolderTree, NotebookPen, PlayCircle, Target } from 'lucide-react';
import { Brand } from '@/components/layout/Brand';
import { Button } from '@/components/ui';
import { brand } from '@/config/brand';
import { useDocumentTitle } from '@/lib/hooks';

const features = [
  { icon: FolderTree, title: 'A place for every lecture', text: 'Exams, subjects and nested folders mirror how you actually study.' },
  { icon: PlayCircle, title: 'YouTube, organised', text: 'Import a playlist or add single videos and study them in a distraction-free player.' },
  { icon: Target, title: 'Honest progress', text: 'Completion is counted once per lecture — no matter how many folders it lives in.' },
  { icon: NotebookPen, title: 'Notes that stay', text: 'Write notes beside each video and pick up from where you paused.' },
  { icon: CalendarCheck2, title: 'A plan for today', text: 'Set a daily target, schedule sessions and see what is overdue.' },
  { icon: BookOpenCheck, title: 'Yours, privately', text: 'Your library is private to your account and never shared.' },
];

/** The signed-out home page. */
export function Landing() {
  useDocumentTitle();
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <div className="landing-nav-actions">
          <SignInButton mode="redirect">
            <Button variant="ghost">Sign in</Button>
          </SignInButton>
          <SignUpButton mode="redirect">
            <Button variant="primary">Get started</Button>
          </SignUpButton>
        </div>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">For exam aspirants and self-learners</p>
          <h1>{brand.tagline}</h1>
          <p className="hero-sub">{brand.description}</p>
          <div className="hero-actions">
            <SignUpButton mode="redirect">
              <Button variant="primary" size="md">
                Create your free workspace
              </Button>
            </SignUpButton>
            <SignInButton mode="redirect">
              <Button>I already have an account</Button>
            </SignInButton>
          </div>
          <p className="hero-note">PrepPilot organises videos by their official YouTube links and embedded player. It never downloads or rehosts content.</p>
        </section>
        <section className="landing-features" aria-label="Features">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="feature">
              <div className="feature-icon">
                <Icon size={20} aria-hidden />
              </div>
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="landing-foot">
        © {new Date().getFullYear()} {brand.name}
      </footer>
    </div>
  );
}
