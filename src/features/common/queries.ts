import { useQuery } from '@tanstack/react-query';
import { api, keys } from '@/lib/api';
import type { Exam, ExamStatus, Folder, Subject } from '@/lib/types';

export const useExams = (status?: ExamStatus) =>
  useQuery({ queryKey: [...keys.exams, 'list', status ?? 'all'], queryFn: () => api<Exam[]>('/exams', { query: { status } }) });

export const useSubjects = (examId?: string) =>
  useQuery({ queryKey: [...keys.subjects, 'list', examId ?? 'all'], queryFn: () => api<Subject[]>('/subjects', { query: { examId } }) });

export const useFolders = (subjectId?: string | null) =>
  useQuery({ queryKey: keys.folders(subjectId ?? ''), queryFn: () => api<Folder[]>(`/subjects/${subjectId}/folders`), enabled: Boolean(subjectId) });

export interface FlatFolder extends Folder {
  depth: number;
  path: string[];
}
/** Depth-first flattening of a subject's folders so pickers can show an indented tree. */
export function flattenFolders(folders: Folder[]): FlatFolder[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const siblings = byParent.get(f.parentFolderId);
    if (siblings) siblings.push(f);
    else byParent.set(f.parentFolderId, [f]);
  }
  const out: FlatFolder[] = [];
  const walk = (parent: string | null, depth: number, path: string[]) => {
    for (const f of (byParent.get(parent) ?? []).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))) {
      const p = [...path, f.name];
      out.push({ ...f, depth, path: p });
      walk(f.id, depth + 1, p);
    }
  };
  walk(null, 0, []);
  return out;
}
