import { useEffect, useMemo, useState } from 'react';
import { SelectField } from '@/components/ui';
import type { Destination } from '@/lib/types';
import { flattenFolders, useExams, useFolders, useSubjects } from './queries';

interface Props {
  value: Destination | null;
  onChange: (d: Destination | null) => void;
  /** Lets the user leave content unfiled (value null). */
  optional?: boolean;
  /** Folder ids that must not be offered (e.g. a folder and its descendants when moving it). */
  excludeFolderIds?: Set<string>;
  idPrefix?: string;
  error?: string | null;
}

/** Exam → Subject → Folder picker used by Import, Add video and "Move to…". Keyboard friendly (native selects). */
export function DestinationPicker({ value, onChange, optional, excludeFolderIds, error }: Props) {
  const exams = useExams();
  const activeExams = useMemo(() => (exams.data ?? []).filter((e) => e.status !== 'ARCHIVED'), [exams.data]);
  const [examId, setExamId] = useState<string>('');
  const subjects = useSubjects(examId || undefined);
  const folders = useFolders(value?.subjectId);

  // Derive the exam from an incoming destination (e.g. opened from inside a subject).
  const allSubjects = useSubjects();
  useEffect(() => {
    if (value?.subjectId && !examId) {
      const s = allSubjects.data?.find((x) => x.id === value.subjectId);
      if (s) setExamId(s.examId);
    }
  }, [value?.subjectId, examId, allSubjects.data]);

  const flat = useMemo(() => flattenFolders(folders.data ?? []).filter((f) => !excludeFolderIds?.has(f.id)), [folders.data, excludeFolderIds]);
  const visibleSubjects = (subjects.data ?? []).filter((s) => !s.archived);

  return (
    <fieldset className="destination">
      <legend className="sr-only">Destination</legend>
      <SelectField
        label="Exam"
        value={examId}
        error={error && !examId ? error : null}
        onChange={(e) => {
          setExamId(e.target.value);
          onChange(null);
        }}
      >
        <option value="">{optional ? "Don't file yet" : 'Choose an exam…'}</option>
        {activeExams.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </SelectField>
      {examId && (
        <SelectField
          label="Subject"
          value={value?.subjectId ?? ''}
          error={error && examId && !value ? error : null}
          onChange={(e) => onChange(e.target.value ? { subjectId: e.target.value, folderId: null } : null)}
        >
          <option value="">{visibleSubjects.length || subjects.isLoading ? 'Choose a subject…' : 'This exam has no subjects yet'}</option>
          {visibleSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      )}
      {value?.subjectId && (
        <SelectField label="Folder" optional value={value.folderId ?? ''} onChange={(e) => onChange({ subjectId: value.subjectId, folderId: e.target.value || null })}>
          <option value="">Directly in the subject</option>
          {flat.map((f) => (
            <option key={f.id} value={f.id}>
              {' '.repeat(f.depth)}
              {f.depth ? '↳ ' : ''}
              {f.name}
            </option>
          ))}
        </SelectField>
      )}
    </fieldset>
  );
}
