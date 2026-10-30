import { CalendarClock, ListVideo, MoreHorizontal, Pencil, PlayCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, Menu } from '@/components/ui';
import { useDialogs } from '@/lib/dialogs';
import { addDays, formatMinutes, relativeDay, todayKey } from '@/lib/format';
import type { StudyTask } from '@/lib/types';
import { toast } from '@/lib/toast';
import './planner.css';
import { useDeleteTask, useUpdateTask } from './queries';

export interface TaskRowProps {
  task: StudyTask;
  /** Compact variant for the dashboard; shows checkbox, title, subject and minutes only. */
  compact?: boolean;
  /** Show the scheduled date (used in upcoming/overdue lists). */
  showDate?: boolean;
}

export function TaskRow({ task, compact, showDate }: TaskRowProps) {
  const dialogs = useDialogs();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const [confirming, setConfirming] = useState(false);
  const done = task.status === 'DONE';

  const context = [task.exam?.name, task.subject?.name, task.folder?.name].filter(Boolean).join(' › ');
  const compactContext = task.subject?.name ?? task.exam?.name;

  const toggle = () => update.mutate({ id: task.id, status: done ? 'TODO' : 'DONE' });
  const tomorrow = addDays(todayKey(), 1);

  return (
    <li className={`task-row ${done ? 'is-done' : ''} ${compact ? 'compact' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={done}
        disabled={update.isPending}
        onChange={toggle}
        aria-label={`Mark '${task.title}' as ${done ? 'to do' : 'done'}`}
      />
      <div className="task-main">
        <div className="row row-wrap">
          <span className="task-title">{task.title}</span>
          {done && <span className="task-done-tag">Done</span>}
        </div>
        <div className="task-meta">
          {compact ? compactContext && <span>{compactContext}</span> : context && <span>{context}</span>}
          {showDate && !compact && <span>{relativeDay(task.scheduledDate)}</span>}
          <span title="Estimated time you plan to spend — not measured study time">~{formatMinutes(task.estimatedDurationMinutes)} planned</span>
        </div>
        {!compact && task.description && <p className="task-meta">{task.description}</p>}
        {!compact && (task.video || task.playlist) && (
          <div className="task-meta">
            {task.video && (
              <Link className="task-chip" to={`/watch/${task.video.id}`}>
                <PlayCircle size={13} aria-hidden />
                <span className="truncate">{task.video.title}</span>
              </Link>
            )}
            {task.playlist && (
              <Link className="task-chip" to={`/playlists/${task.playlist.id}`}>
                <ListVideo size={13} aria-hidden />
                <span className="truncate">{task.playlist.title}</span>
              </Link>
            )}
          </div>
        )}
      </div>
      <Menu
        label={`More actions for ${task.title}`}
        trigger={<MoreHorizontal size={18} aria-hidden />}
        items={[
          { label: 'Edit', icon: <Pencil size={16} />, onSelect: () => dialogs.open({ kind: 'task', task }) },
          {
            label: 'Reschedule to tomorrow',
            icon: <CalendarClock size={16} />,
            disabled: task.scheduledDate === tomorrow,
            onSelect: () => update.mutate({ id: task.id, scheduledDate: tomorrow }, { onSuccess: () => toast.success('Moved to tomorrow') }),
          },
          { label: 'Delete', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: () => setConfirming(true) },
        ]}
      />
      {confirming && (
        <ConfirmDialog
          title="Delete this task?"
          confirmLabel="Delete task"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await remove.mutateAsync(task.id);
            toast.success('Task deleted');
          }}
        >
          <p>
            “{task.title}” will be removed from your plan. Linked videos and playlists are not affected.
          </p>
        </ConfirmDialog>
      )}
    </li>
  );
}
