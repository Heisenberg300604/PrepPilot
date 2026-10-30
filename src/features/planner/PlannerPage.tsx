import { CalendarCheck2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, IconButton, PageHeader, Progress, Skeleton, TextField } from '@/components/ui';
import { useDialogs } from '@/lib/dialogs';
import { addDays, formatDate, formatMinutes, parseKey, plural, relativeDay, todayKey } from '@/lib/format';
import { useDocumentTitle, useProfile, useUpdateProfile } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import { countByDate, groupByDate, parseMinutes, resolveSelectedDay, summarizeDay, weekAround } from './dates';
import './planner.css';
import { useTasks } from './queries';
import { TaskRow } from './TaskRow';

function TaskList({ children }: { children: React.ReactNode }) {
  return <ul className="task-list">{children}</ul>;
}

function TargetEditor({ current }: { current: number }) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateProfile();
  const id = useId();
  const save = (e: FormEvent) => {
    e.preventDefault();
    const n = parseMinutes(value);
    if (n === null) return setError('Enter whole minutes from 0 to 1440.');
    setError(null);
    update.mutate({ dailyStudyTargetMinutes: n }, { onSuccess: () => toast.success('Daily target updated') });
  };
  return (
    <form className="target-edit" onSubmit={save} noValidate aria-labelledby={id}>
      <TextField label="Daily target (minutes)" type="number" min={0} max={1440} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} error={error} />
      <Button type="submit" size="md" loading={update.isPending} disabled={value === String(current)}>
        Save
      </Button>
      <span id={id} className="sr-only">
        Edit daily study target
      </span>
    </form>
  );
}

export default function PlannerPage() {
  useDocumentTitle('Planner');
  const dialogs = useDialogs();
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const selected = resolveSelectedDay(params.get('date'), today);
  const select = (key: string) => setParams(key === today ? {} : { date: key });

  const week = useMemo(() => weekAround(selected), [selected]);
  const upcomingFrom = addDays(selected >= today ? selected : today, 1);
  const weekTasks = useTasks({ from: week[0], to: week[6] });
  const overdue = useTasks({ overdueBefore: today });
  const upcoming = useTasks({ from: upcomingFrom, to: addDays(upcomingFrom, 6) });
  const profile = useProfile();

  const dayTasks = useMemo(() => (weekTasks.data ?? []).filter((t) => t.scheduledDate === selected), [weekTasks.data, selected]);
  const counts = useMemo(() => countByDate(weekTasks.data ?? []), [weekTasks.data]);
  const target = profile.data?.dailyStudyTargetMinutes ?? 0;
  const summary = summarizeDay(dayTasks, target);
  const grouped = useMemo(() => groupByDate(upcoming.data ?? []), [upcoming.data]);
  const overdueTasks = overdue.data ?? [];

  const heading = relativeDay(selected, today);
  return (
    <>
      <PageHeader
        eyebrow="Study planner"
        title={heading}
        description={formatDate(selected, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
        actions={
          <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => dialogs.open({ kind: 'task', defaultDate: selected })}>
            Add task
          </Button>
        }
      >
        <div className="planner-nav" role="group" aria-label="Choose day">
          <IconButton label="Previous day" onClick={() => select(addDays(selected, -1))}>
            <ChevronLeft size={18} />
          </IconButton>
          <Button size="sm" onClick={() => select(today)} disabled={selected === today}>
            Today
          </Button>
          <IconButton label="Next day" onClick={() => select(addDays(selected, 1))}>
            <ChevronRight size={18} />
          </IconButton>
          <input
            type="date"
            className="input"
            aria-label="Go to date"
            value={selected}
            onChange={(e) => {
              const v = resolveSelectedDay(e.target.value, '');
              if (v) select(v);
            }}
          />
        </div>
      </PageHeader>

      <div className="week-strip" role="group" aria-label="Week overview">
        {week.map((key) => {
          const n = counts[key] ?? 0;
          const d = parseKey(key);
          return (
            <button
              key={key}
              type="button"
              className={`week-day ${key === selected ? 'is-selected' : ''}`}
              aria-pressed={key === selected}
              aria-current={key === today ? 'date' : undefined}
              aria-label={`${formatDate(key, { weekday: 'long', month: 'long', day: 'numeric' })}, ${plural(n, 'task')}${key === today ? ', today' : ''}`}
              onClick={() => select(key)}
            >
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <strong>{d.getDate()}</strong>
              <span className="week-count">{n ? plural(n, 'task') : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="planner-layout">
        <div className="stack">
          <section aria-labelledby="day-h">
            <div className="section-head" style={{ marginTop: 0 }}>
              <h2 id="day-h">Tasks for {['Today', 'Tomorrow', 'Yesterday'].includes(heading) ? heading.toLowerCase() : formatDate(selected, { month: 'short', day: 'numeric' })}</h2>
            </div>
            {weekTasks.isLoading ? (
              <div role="status" aria-label="Loading tasks" className="stack">
                <Skeleton style={{ height: 64 }} />
                <Skeleton style={{ height: 64 }} />
              </div>
            ) : weekTasks.isError ? (
              <ErrorState error={weekTasks.error} onRetry={() => weekTasks.refetch()} title="Couldn't load your tasks" />
            ) : dayTasks.length === 0 ? (
              <EmptyState
                icon={CalendarCheck2}
                title="Nothing planned for this day"
                action={
                  <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => dialogs.open({ kind: 'task', defaultDate: selected })}>
                    Plan a study session
                  </Button>
                }
              >
                Add a task to make the day count.
              </EmptyState>
            ) : (
              <TaskList>
                {dayTasks.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </TaskList>
            )}
          </section>

          {overdueTasks.length > 0 && (
            <section aria-labelledby="overdue-h">
              <div className="section-head">
                <div>
                  <h2 id="overdue-h">Overdue</h2>
                  <p>{plural(overdueTasks.length, 'unfinished task')} from earlier days.</p>
                </div>
              </div>
              <TaskList>
                {overdueTasks.map((t) => (
                  <TaskRow key={t.id} task={t} showDate />
                ))}
              </TaskList>
            </section>
          )}
          {overdue.isError && <ErrorState error={overdue.error} onRetry={() => overdue.refetch()} title="Couldn't load overdue tasks" />}

          <section aria-labelledby="up-h">
            <div className="section-head">
              <div>
                <h2 id="up-h">Coming up</h2>
                <p>
                  {formatDate(upcomingFrom, { month: 'short', day: 'numeric' })} – {formatDate(addDays(upcomingFrom, 6), { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
            {upcoming.isLoading ? (
              <Skeleton style={{ height: 64 }} />
            ) : upcoming.isError ? (
              <ErrorState error={upcoming.error} onRetry={() => upcoming.refetch()} title="Couldn't load upcoming tasks" />
            ) : grouped.length === 0 ? (
              <p className="muted">Nothing scheduled for the next week.</p>
            ) : (
              grouped.map(([date, list]) => (
                <div className="upcoming-group" key={date}>
                  <h3>{relativeDay(date, today)}</h3>
                  <TaskList>
                    {list.map((t) => (
                      <TaskRow key={t.id} task={t} />
                    ))}
                  </TaskList>
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="card summary-card" aria-label="Day summary">
          <h2>Day summary</h2>
          <div className="summary-stats">
            <div>
              <strong>{summary.planned}</strong>
              <span>planned</span>
            </div>
            <div>
              <strong>{summary.completed}</strong>
              <span>done</span>
            </div>
            <div>
              <strong>{formatMinutes(summary.plannedMinutes)}</strong>
              <span>estimated</span>
            </div>
          </div>
          {target > 0 ? (
            <>
              <div className="row">
                <span>
                  {formatMinutes(summary.completedMinutes)} of {formatMinutes(target)} target
                </span>
                <span className="spacer" />
                <strong>{summary.targetPercent}%</strong>
              </div>
              <Progress value={summary.targetPercent} label="Progress toward daily target" />
            </>
          ) : (
            <p className="muted">No daily target set. Add one below to see your progress.</p>
          )}
          <p className="planner-footnote">
            Minutes are the estimates you planned for completed tasks, not measured study time. Days are calendar dates in your local time zone.
          </p>
          {profile.data && <TargetEditor key={target} current={target} />}
        </aside>
      </div>
    </>
  );
}
