import { CheckCircle2, CircleDashed, GraduationCap, History, ListChecks, Plus, PlayCircle, Rocket } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui';
import { VideoCard } from '@/features/library/VideoCard';
import { useDashboard } from '@/features/planner/queries';
import { useDialogs } from '@/lib/dialogs';
import { formatDate, greeting, plural, todayKey } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import type { Dashboard } from '@/lib/types';
import { ActivityList } from './ActivityList';
import { ExamCard } from './ExamCard';
import { QuickActions } from './QuickActions';
import { TodayPlan } from './TodayPlan';
import './dashboard.css';

export const firstName = (name: string | null | undefined) => name?.trim().split(/\s+/)[0] || null;

function Stat({ icon: Icon, label, value, meta, tone = '' }: { icon: typeof GraduationCap; label: string; value: string | number; meta?: string; tone?: string }) {
  return (
    <div className={`stat ${tone}`}>
      <span className="stat-icon">
        <Icon size={18} aria-hidden />
      </span>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {meta && <div className="stat-meta">{meta}</div>}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading your dashboard" className="stack">
      <Skeleton style={{ height: 64, maxWidth: 420 }} />
      <div className="stats-grid">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} style={{ height: 88 }} />
        ))}
      </div>
      <div className="dash-grid">
        <Skeleton style={{ height: 300 }} />
        <Skeleton style={{ height: 300 }} />
      </div>
    </div>
  );
}

/** First-run: nothing created and nothing planned — show a guided start, not a wall of zeros. */
export function isFirstRun(d: Dashboard) {
  return d.exams.length === 0 && d.overview.totalVideos === 0 && d.today.tasks.length === 0;
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const today = useMemo(todayKey, []);
  const q = useDashboard(today);
  const dialogs = useDialogs();

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load your dashboard" />;
  const d = q.data;
  const name = firstName(d.displayName);
  const o = d.overview;

  return (
    <div className="dashboard">
      <header className="dash-welcome">
        <div>
          <div className="eyebrow">{formatDate(today, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1>
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="page-desc">Small steps every day. Big results over time.</p>
        </div>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'task', defaultDate: today })}>
          Plan a study session
        </Button>
      </header>

      <QuickActions today={today} />

      {isFirstRun(d) ? (
        <section className="card first-run">
          <div className="empty-icon">
            <Rocket size={22} aria-hidden />
          </div>
          <div>
            <h2>Let's set up your first exam</h2>
            <p className="page-desc">Create an exam, add its subjects, then import a YouTube playlist or add videos. Your progress will show up right here.</p>
          </div>
          <div className="row row-wrap">
            <Button variant="primary" onClick={() => dialogs.open({ kind: 'exam' })}>
              Create an exam
            </Button>
            <Link to="/onboarding" className="btn btn-secondary">
              Guided setup
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section className="stats-grid" aria-label="Overview">
            <Stat icon={GraduationCap} label="Active exams" value={o.activeExams} />
            <Stat icon={PlayCircle} label="Unique videos" value={o.totalVideos} meta="Counted once each" tone="violet" />
            <Stat icon={CheckCircle2} label="Completed" value={o.completedVideos} meta={`${o.percent}% overall`} tone="green" />
            <Stat icon={CircleDashed} label="Remaining" value={o.remainingVideos} tone="amber" />
            <Stat icon={ListChecks} label="Today's tasks" value={`${o.todayTasksDone}/${o.todayTasks}`} meta={o.todayTasks === 0 ? 'None planned' : o.todayTasks === o.todayTasksDone ? 'All done' : `${o.todayTasks - o.todayTasksDone} to go`} tone="blue" />
          </section>

          <div className="overall">
            <div className="overall-row">
              <span>Overall progress across active exams</span>
              <strong>{o.percent}%</strong>
            </div>
            <Progress value={o.percent} label="Overall progress across active exams" size="lg" />
          </div>

          <div className="dash-grid">
            <div className="dash-main">
              <section aria-labelledby="exams-h">
                <div className="section-head tight">
                  <div>
                    <h2 id="exams-h">Your exams</h2>
                    <p>Keep the bigger picture in sight.</p>
                  </div>
                  <Link to="/exams" className="text-link">
                    View all
                  </Link>
                </div>
                {d.exams.length ? (
                  <div className="exam-grid">
                    {d.exams.map((e) => (
                      <ExamCard key={e.id} exam={e} today={today} />
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={GraduationCap} title="No active exams" action={<Button variant="primary" onClick={() => dialogs.open({ kind: 'exam' })}>Create an exam</Button>}>
                    Archived exams live under My exams. Create a new one to keep studying.
                  </EmptyState>
                )}
              </section>

              <section aria-labelledby="continue-h">
                <div className="section-head tight">
                  <div>
                    <h2 id="continue-h">Continue studying</h2>
                    <p>Right where you paused.</p>
                  </div>
                  <Link to="/recent" className="text-link">
                    View history
                  </Link>
                </div>
                {d.continueStudying.length ? (
                  <div className="video-grid">
                    {d.continueStudying.slice(0, 3).map((v) => (
                      <VideoCard key={v.id} video={v} showLocation continueCta />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={History}
                    title="Open a lecture to start tracking where you left off"
                    action={
                      <>
                        <Link to="/library" className="btn btn-primary">
                          Browse library
                        </Link>
                        <Button onClick={() => dialogs.open({ kind: 'import' })}>Import a playlist</Button>
                      </>
                    }
                  >
                    {o.totalVideos > 0 ? `You have ${plural(o.totalVideos, 'lecture')} ready to go.` : 'Add some lectures first, then pick one to begin.'}
                  </EmptyState>
                )}
              </section>
            </div>

            <aside className="dash-side">
              <TodayPlan today={d.today} />
              <section className="card" aria-labelledby="act-h">
                <h2 id="act-h">Recent activity</h2>
                <ActivityList limit={6} />
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
