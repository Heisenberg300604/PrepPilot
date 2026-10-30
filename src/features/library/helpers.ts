import type { VideoQuery } from '@/features/videos/queries';

export type StatusFilter = 'all' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'favorites';
export type LibrarySort = 'added' | 'title' | 'duration' | 'studied';
export type LibraryTab = 'lectures' | 'playlists';

export interface LibraryFilters {
  q: string;
  status: StatusFilter;
  sort: LibrarySort;
  examId: string;
  subjectId: string;
  unfiled: boolean;
  tab: LibraryTab;
}

export const DEFAULT_FILTERS: LibraryFilters = { q: '', status: 'all', sort: 'added', examId: '', subjectId: '', unfiled: false, tab: 'lectures' };

const STATUSES: StatusFilter[] = ['all', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'favorites'];
const SORTS: LibrarySort[] = ['added', 'title', 'duration', 'studied'];

/** Parse (and sanitise) filter state from the URL so refresh/back/forward restore the same view. */
export function readFilters(sp: URLSearchParams): LibraryFilters {
  const status = sp.get('status') as StatusFilter;
  const sort = sp.get('sort') as LibrarySort;
  return {
    q: sp.get('q') ?? '',
    status: STATUSES.includes(status) ? status : 'all',
    sort: SORTS.includes(sort) ? sort : 'added',
    examId: sp.get('exam') ?? '',
    subjectId: sp.get('subject') ?? '',
    unfiled: sp.get('unfiled') === '1',
    tab: sp.get('tab') === 'playlists' ? 'playlists' : 'lectures',
  };
}

/** Serialise only non-default values to keep URLs tidy. */
export function writeFilters(f: LibraryFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q.trim()) sp.set('q', f.q.trim());
  if (f.status !== 'all') sp.set('status', f.status);
  if (f.sort !== 'added') sp.set('sort', f.sort);
  if (f.examId) sp.set('exam', f.examId);
  if (f.subjectId) sp.set('subject', f.subjectId);
  if (f.unfiled) sp.set('unfiled', '1');
  if (f.tab !== 'lectures') sp.set('tab', f.tab);
  return sp;
}

/** Map UI filters to the API's /videos query (without paging). */
export function toVideoQuery(f: LibraryFilters): VideoQuery {
  const q: VideoQuery = { sort: f.sort };
  if (f.q.trim()) q.q = f.q.trim();
  if (f.status === 'favorites') q.favorite = true;
  else if (f.status !== 'all') q.status = f.status;
  if (f.unfiled) q.unfiled = true;
  else {
    if (f.examId) q.examId = f.examId;
    if (f.subjectId) q.subjectId = f.subjectId;
  }
  return q;
}

/** True when anything narrows the list (tab and sort are views, not filters). */
export const hasActiveFilters = (f: LibraryFilters) => Boolean(f.q.trim() || f.status !== 'all' || f.examId || f.subjectId || f.unfiled);
