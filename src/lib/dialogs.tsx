import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import type { Destination, Exam, Folder, StudyTask, Subject, TaskInput } from './types';

/**
 * Global "create / edit" dialogs. Anything in the app (sidebar, topbar quick-add, empty states, pages)
 * can open them with `useDialogs().open('import', { destination })`.
 */
export type DialogRequest =
  | { kind: 'exam'; exam?: Exam | null }
  | { kind: 'subject'; examId?: string; subject?: Subject | null }
  | { kind: 'folder'; subjectId?: string; parentFolderId?: string | null; folder?: Folder | null }
  | { kind: 'import'; destination?: Destination | null }
  | { kind: 'video'; destination?: Destination | null; playlistId?: string }
  | { kind: 'task'; task?: StudyTask | null; defaultDate?: string; defaults?: Partial<TaskInput> };

interface DialogsApi {
  open: (req: DialogRequest) => void;
  close: () => void;
}
const Ctx = createContext<DialogsApi | null>(null);

// Lazy so the initial bundle stays small; each dialog lives with its feature.
const ExamDialog = lazy(() => import('@/features/exams/ExamDialog'));
const SubjectDialog = lazy(() => import('@/features/subjects/SubjectDialog'));
const FolderDialog = lazy(() => import('@/features/folders/FolderDialog'));
const ImportPlaylistDialog = lazy(() => import('@/features/playlists/ImportPlaylistDialog'));
const AddVideoDialog = lazy(() => import('@/features/videos/AddVideoDialog'));
const TaskDialog = lazy(() => import('@/features/planner/TaskDialog'));

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogRequest | null>(null);
  const close = useCallback(() => setReq(null), []);
  const api = useMemo(() => ({ open: setReq, close }), [close]);

  let node: ReactNode = null;
  if (req) {
    const common = { onClose: close };
    const map: Record<DialogRequest['kind'], ComponentType<any>> = {
      exam: ExamDialog,
      subject: SubjectDialog,
      folder: FolderDialog,
      import: ImportPlaylistDialog,
      video: AddVideoDialog,
      task: TaskDialog,
    };
    const Comp = map[req.kind];
    const { kind: _k, ...props } = req;
    node = <Comp {...props} {...common} />;
  }
  return (
    <Ctx.Provider value={api}>
      {children}
      <Suspense fallback={null}>{node}</Suspense>
    </Ctx.Provider>
  );
}

export function useDialogs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDialogs must be used inside <DialogProvider>');
  return v;
}
