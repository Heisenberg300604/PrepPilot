import { useId, useMemo, useState, type FormEvent } from 'react';
import { Button, Dialog, SelectField, TextArea, TextField } from '@/components/ui';
import { flattenFolders, useExams, useFolders, useSubjects } from '@/features/common/queries';
import { usePlaylists } from '@/features/playlists/queries';
import { useVideos } from '@/features/videos/queries';
import { useDebounced } from '@/lib/hooks';
import { todayKey } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { StudyTask, TaskInput } from '@/lib/types';
import { isValidDateKey, parseMinutes } from './dates';
import './planner.css';
import { useCreateTask, useUpdateTask } from './queries';

interface Props {
  task?: StudyTask | null;
  defaultDate?: string;
  defaults?: Partial<TaskInput>;
  onClose: () => void;
}

type Errors = Partial<Record<'title' | 'date' | 'minutes' | 'subject' | 'folder' | 'form', string>>;

/** Searchable, optional link to a video/playlist: a search box feeding a native select. */
function LinkField({ label, kind, value, valueLabel, onChange }: { label: string; kind: 'video' | 'playlist'; value: string; valueLabel?: string; onChange: (id: string, title: string) => void }) {
  const [term, setTerm] = useState('');
  const q = useDebounced(term.trim(), 250);
  const videos = useVideos({ q: q || undefined, limit: 20, sort: 'recent' });
  const playlists = usePlaylists(q || undefined);
  const options = (kind === 'video' ? (videos.data?.items ?? []).map((v) => ({ id: v.id, title: v.title })) : (playlists.data ?? []).slice(0, 20).map((p) => ({ id: p.id, title: p.title }))) as { id: string; title: string }[];
  const searchId = useId();
  const hasCurrent = options.some((o) => o.id === value);
  return (
    <div className="link-search">
      <TextField label={`Search ${kind === 'video' ? 'lectures' : 'playlists'}`} optional id={searchId} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Type to filter…" autoComplete="off" />
      <SelectField label={label} optional value={value} onChange={(e) => onChange(e.target.value, options.find((o) => o.id === e.target.value)?.title ?? '')}>
        <option value="">None</option>
        {value && !hasCurrent && <option value={value}>{valueLabel ?? 'Linked item'}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

export default function TaskDialog({ task, defaultDate, defaults, onClose }: Props) {
  const editing = Boolean(task);
  const create = useCreateTask();
  const update = useUpdateTask();
  const formId = useId();

  const [title, setTitle] = useState(task?.title ?? defaults?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? defaults?.description ?? '');
  const [date, setDate] = useState(task?.scheduledDate ?? defaults?.scheduledDate ?? defaultDate ?? todayKey());
  const [minutes, setMinutes] = useState(String(task?.estimatedDurationMinutes ?? defaults?.estimatedDurationMinutes ?? 30));
  const [examId, setExamId] = useState(task?.exam?.id ?? defaults?.examId ?? '');
  const [subjectId, setSubjectId] = useState(task?.subject?.id ?? defaults?.subjectId ?? '');
  const [folderId, setFolderId] = useState(task?.folder?.id ?? defaults?.folderId ?? '');
  const [videoId, setVideoId] = useState(task?.video?.id ?? defaults?.videoId ?? '');
  const [videoLabel, setVideoLabel] = useState(task?.video?.title ?? '');
  const [playlistId, setPlaylistId] = useState(task?.playlist?.id ?? defaults?.playlistId ?? '');
  const [playlistLabel, setPlaylistLabel] = useState(task?.playlist?.title ?? '');
  const [errors, setErrors] = useState<Errors>({});

  const exams = useExams();
  const allSubjects = useSubjects();
  const folders = useFolders(subjectId || null);
  const flat = useMemo(() => flattenFolders(folders.data ?? []), [folders.data]);
  const subjects = useMemo(() => (allSubjects.data ?? []).filter((s) => !s.archived && (!examId || s.examId === examId)), [allSubjects.data, examId]);
  const busy = create.isPending || update.isPending;

  const pickExam = (id: string) => {
    setExamId(id);
    // a subject (and its folder) from another exam can no longer apply
    const s = allSubjects.data?.find((x) => x.id === subjectId);
    if (id && s && s.examId !== id) {
      setSubjectId('');
      setFolderId('');
    }
    if (!id) setErrors((e) => ({ ...e, subject: undefined }));
  };
  const pickSubject = (id: string) => {
    setSubjectId(id);
    setFolderId('');
    const s = allSubjects.data?.find((x) => x.id === id);
    if (s) setExamId(s.examId); // choosing a subject fills in its exam
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    const t = title.trim();
    if (!t) next.title = 'Give the task a title.';
    else if (t.length > 200) next.title = 'Keep the title under 200 characters.';
    if (!isValidDateKey(date)) next.date = 'Choose a valid date.';
    const mins = parseMinutes(minutes);
    if (mins === null) next.minutes = 'Enter whole minutes from 0 to 1440.';
    const subject = allSubjects.data?.find((s) => s.id === subjectId);
    if (subjectId && examId && subject && subject.examId !== examId) next.subject = 'That subject belongs to a different exam.';
    if (folderId && !subjectId) next.folder = 'Choose a subject before choosing a folder.';
    else if (folderId && folders.data && !folders.data.some((f) => f.id === folderId)) next.folder = 'That folder is not in the selected subject.';
    setErrors(next);
    if (Object.keys(next).length) return;

    const body: TaskInput = {
      title: t,
      description: description.trim() || null,
      scheduledDate: date,
      estimatedDurationMinutes: mins!,
      examId: examId || null,
      subjectId: subjectId || null,
      folderId: folderId || null,
      videoId: videoId || null,
      playlistId: playlistId || null,
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, ...body });
      else await create.mutateAsync(body);
      toast.success(editing ? 'Task updated' : 'Task added to your plan');
      onClose();
    } catch (err) {
      // server-side relationship check (422) or other failure: keep the dialog open with the message
      setErrors({ form: (err as Error).message });
    }
  };

  return (
    <Dialog
      title={editing ? 'Edit task' : 'Plan a study session'}
      description={editing ? undefined : 'Add a task to your plan. Time is an estimate of how long you intend to spend.'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {editing ? 'Save changes' : 'Add task'}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit} noValidate>
        {errors.form && (
          <p className="field-error" role="alert">
            {errors.form}
          </p>
        )}
        <TextField label="Task" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="e.g. Watch Lecture 12 and note formulas" autoFocus maxLength={200} />
        <TextArea label="Notes" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        <div className="form-row">
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <TextField label="Estimated minutes" type="number" inputMode="numeric" min={0} max={1440} value={minutes} onChange={(e) => setMinutes(e.target.value)} error={errors.minutes} hint="How long you plan to spend." />
        </div>
        <div className="form-row">
          <SelectField label="Exam" optional value={examId} onChange={(e) => pickExam(e.target.value)}>
            <option value="">No exam</option>
            {(exams.data ?? []).filter((x) => x.status !== 'ARCHIVED' || x.id === examId).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Subject" optional value={subjectId} onChange={(e) => pickSubject(e.target.value)} error={errors.subject}>
            <option value="">No subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {examId ? s.name : `${s.name}${s.examName ? ` (${s.examName})` : ''}`}
              </option>
            ))}
          </SelectField>
        </div>
        {subjectId && (
          <SelectField label="Folder" optional value={folderId} onChange={(e) => setFolderId(e.target.value)} error={errors.folder}>
            <option value="">Any folder</option>
            {flat.map((f) => (
              <option key={f.id} value={f.id}>
                {' '.repeat(f.depth)}
                {f.depth ? '↳ ' : ''}
                {f.name}
              </option>
            ))}
          </SelectField>
        )}
        <LinkField label="Linked lecture" kind="video" value={videoId} valueLabel={videoLabel} onChange={(id, t2) => (setVideoId(id), setVideoLabel(t2))} />
        <LinkField label="Linked playlist" kind="playlist" value={playlistId} valueLabel={playlistLabel} onChange={(id, t2) => (setPlaylistId(id), setPlaylistLabel(t2))} />
      </form>
    </Dialog>
  );
}
