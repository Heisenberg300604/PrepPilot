import { ListVideo, LibraryBig, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, CardSkeletons, EmptyState, ErrorState, PageHeader, Progress, Segmented, Thumb } from '@/components/ui';
import { useExams, useSubjects } from '@/features/common/queries';
import { usePlaylists } from '@/features/playlists/queries';
import { useDialogs } from '@/lib/dialogs';
import { locationText, plural } from '@/lib/format';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import type { Playlist } from '@/lib/types';
import { hasActiveFilters, readFilters, toVideoQuery, writeFilters, type LibraryFilters, type LibrarySort, type StatusFilter } from './helpers';
import { PagedVideoGrid } from './PagedVideoGrid';
import './library.css';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'NOT_STARTED', label: 'Not started' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'favorites', label: 'Favorites' },
];

function PlaylistCard({ p }: { p: Playlist }) {
  return (
    <article className="pc">
      <Link to={`/playlists/${p.id}`} className="pc-thumb" tabIndex={-1} aria-hidden>
        <Thumb src={p.thumbnailUrl} />
      </Link>
      <div className="pc-body">
        <h3>
          <Link to={`/playlists/${p.id}`}>{p.title}</Link>
        </h3>
        <p className="vc-loc truncate">{locationText(p.location)}</p>
        <div className="pc-stats">
          <span>{plural(p.stats.total, 'lecture')}</span>
          <strong>{p.stats.percent}%</strong>
        </div>
        <Progress value={p.stats.percent} label={`${p.title} progress`} size="sm" />
      </div>
    </article>
  );
}

function PlaylistsTab({ q, filtered }: { q: string; filtered: boolean }) {
  const playlists = usePlaylists(q.trim() || undefined);
  const dialogs = useDialogs();
  if (playlists.isLoading) return <CardSkeletons count={4} height={220} />;
  if (playlists.isError) return <ErrorState error={playlists.error} onRetry={() => playlists.refetch()} />;
  const list = playlists.data ?? [];
  if (!list.length)
    return filtered ? (
      <EmptyState icon={Search} title="No playlists match">
        Try a different search term.
      </EmptyState>
    ) : (
      <EmptyState
        icon={ListVideo}
        title="No playlists yet"
        action={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'import' })}>
            Import a playlist
          </Button>
        }
      >
        Import a YouTube playlist, or create a collection inside a subject.
      </EmptyState>
    );
  return (
    <div className="playlist-grid">
      {list.map((p) => (
        <PlaylistCard key={p.id} p={p} />
      ))}
    </div>
  );
}

export default function LibraryPage() {
  useDocumentTitle('Library');
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const dialogs = useDialogs();
  const [text, setText] = useState(filters.q);
  const debounced = useDebounced(text, 250);
  const exams = useExams();
  const subjects = useSubjects(filters.examId || undefined);

  const update = (patch: Partial<LibraryFilters>) => setParams(writeFilters({ ...filters, ...patch }), { replace: true });

  // debounced search text -> URL
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // back/forward changed the URL -> reflect it in the input
  useEffect(() => {
    if (filters.q.trim() !== text.trim() && filters.q.trim() !== debounced.trim()) setText(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  const query = useMemo(() => toVideoQuery(filters), [filters]);
  const active = hasActiveFilters(filters);
  const [total, setTotal] = useState<number | null>(null);
  const clear = () => {
    setText('');
    setParams(writeFilters({ ...filters, q: '', status: 'all', examId: '', subjectId: '', unfiled: false }), { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Everything you've saved"
        title="Library"
        description="Find any lecture without digging through folders. Each lecture is listed once, however many places it lives in."
        actions={
          <>
            <Button icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'video' })}>
              Add video
            </Button>
            <Button variant="primary" icon={<ListVideo size={16} />} onClick={() => dialogs.open({ kind: 'import' })}>
              Import playlist
            </Button>
          </>
        }
      />

      <div className="lib-toolbar">
        <div className="lib-search">
          <Search size={16} aria-hidden />
          <input type="search" aria-label="Search the library" placeholder="Search by exam, subject, folder, playlist or lecture…" value={text} onChange={(e) => setText(e.target.value)} />
          {text && (
            <button type="button" className="icon-btn icon-btn-sm" aria-label="Clear search" onClick={() => setText('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <Segmented label="Library section" value={filters.tab} onChange={(tab) => update({ tab })} options={[{ value: 'lectures', label: 'Lectures' }, { value: 'playlists', label: 'Playlists' }]} />
      </div>

      {filters.tab === 'lectures' && (
        <div className="lib-filters">
          <Segmented label="Filter by status" value={filters.status} onChange={(status) => update({ status })} options={STATUS_OPTIONS} />
          <div className="lib-selects">
            <label className="lib-select">
              <span className="sr-only">Exam</span>
              <select className="input select" value={filters.examId} disabled={filters.unfiled} onChange={(e) => update({ examId: e.target.value, subjectId: '' })}>
                <option value="">All exams</option>
                {(exams.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lib-select">
              <span className="sr-only">Subject</span>
              <select className="input select" value={filters.subjectId} disabled={filters.unfiled || !filters.examId} onChange={(e) => update({ subjectId: e.target.value })}>
                <option value="">{filters.examId ? 'All subjects' : 'Pick an exam first'}</option>
                {(subjects.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="lib-select">
              <span className="sr-only">Sort by</span>
              <select className="input select" value={filters.sort} onChange={(e) => update({ sort: e.target.value as LibrarySort })}>
                <option value="added">Recently added</option>
                <option value="studied">Recently studied</option>
                <option value="title">Title (A–Z)</option>
                <option value="duration">Longest first</option>
              </select>
            </label>
            <label className="checkbox lib-unfiled">
              <input type="checkbox" checked={filters.unfiled} onChange={(e) => update({ unfiled: e.target.checked, examId: '', subjectId: '' })} />
              <span>Not filed yet</span>
            </label>
          </div>
        </div>
      )}

      <div className="lib-count" role="status" aria-live="polite">
        {filters.tab === 'lectures' && total !== null && <span>{plural(total, 'lecture')}</span>}
        {active && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>

      {filters.tab === 'lectures' ? (
        <PagedVideoGrid
          query={query}
          onTotal={setTotal}
          empty={
            active ? (
              <EmptyState icon={Search} title="No lectures match" action={<Button onClick={clear}>Clear filters</Button>}>
                Nothing in your library fits these filters. Try a broader search.
              </EmptyState>
            ) : (
              <EmptyState
                icon={LibraryBig}
                title="Your library is empty"
                action={
                  <>
                    <Button variant="primary" icon={<ListVideo size={16} />} onClick={() => dialogs.open({ kind: 'import' })}>
                      Import a playlist
                    </Button>
                    <Button icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'video' })}>
                      Add a video
                    </Button>
                  </>
                }
              >
                Lectures you import or add show up here, searchable in one place.
              </EmptyState>
            )
          }
        />
      ) : (
        <PlaylistsTab q={filters.q} filtered={Boolean(filters.q.trim())} />
      )}
    </>
  );
}
