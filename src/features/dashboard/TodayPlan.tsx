import { ArrowRight, CalendarCheck2, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Progress } from '@/components/ui';
import { TaskRow } from '@/features/planner/TaskRow';
import { useDialogs } from '@/lib/dialogs';
import { formatMinutes, plural } from '@/lib/format';
import type { Dashboard } from '@/lib/types';

export function TodayPlan({ today }: { today: Dashboard['today'] }) {
  const dialogs = useDialogs();
  const open = () => dialogs.open({ kind: 'task', defaultDate: today.date });
  const done = today.tasks.filter((t) => t.status === 'DONE').length;
  return (
    <section className="card today-plan" aria-labelledby="today-h">
      <div className="today-head">
        <div>
          <h2 id="today-h">Today's plan</h2>
          <p className="muted">
            {today.tasks.length ? `${done} of ${plural(today.tasks.length, 'task')} done` : 'Nothing planned yet'}
          </p>
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={open}>
          Add task
        </Button>
      </div>

      <div className="today-target">
        <div className="today-target-row">
          <span>Daily target</span>
          <strong>
            {formatMinutes(today.completedPlannedMinutes)} / {formatMinutes(today.targetMinutes)}
          </strong>
        </div>
        <Progress value={today.targetPercent} label="Progress toward daily study target" />
        <p className="muted today-note">
          {formatMinutes(today.plannedMinutes)} planned today. Based on your task estimates, not measured study time.
        </p>
      </div>

      {today.tasks.length ? (
        <ul className="today-tasks">
          {today.tasks.map((t) => (
            <TaskRow key={t.id} task={t} compact />
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarCheck2} title="A clear slate" action={<Button variant="primary" onClick={open}>Plan a study session</Button>}>
          Add a task to make today count.
        </EmptyState>
      )}

      <div className="today-foot">
        {today.overdueCount > 0 && (
          <Link to="/planner" className="today-chip warn">
            {plural(today.overdueCount, 'overdue task')}
          </Link>
        )}
        {today.upcomingCount > 0 && (
          <Link to="/planner" className="today-chip">
            {today.upcomingCount} upcoming
          </Link>
        )}
        <Link to="/planner" className="today-link">
          Open planner <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
