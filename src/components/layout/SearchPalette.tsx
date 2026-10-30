import { useQuery } from '@tanstack/react-query';
import { BookOpen, Folder, GraduationCap, ListVideo, Loader2, PlayCircle, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, keys } from '@/lib/api';
import { useDebounced } from '@/lib/hooks';
import type { SearchResults } from '@/lib/types';

interface Row {
  key: string;
  group: string;
  label: string;
  sub?: string;
  to: string;
  icon: typeof Search;
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const debounced = useDebounced(q.trim(), 200);
  const dialog = useRef<HTMLDialogElement>(null);
  const nav = useNavigate();
  const results = useQuery({ queryKey: keys.search(debounced), queryFn: () => api<SearchResults>('/search', { query: { q: debounced } }), enabled: debounced.length > 0, staleTime: 15_000 });

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const r = results.data;
    if (!r || !debounced) return [];
    return [
      ...r.exams.map((e) => ({ key: `e${e.id}`, group: 'Exams', label: e.name, to: `/exams/${e.id}`, icon: GraduationCap })),
      ...r.subjects.map((s) => ({ key: `s${s.id}`, group: 'Subjects', label: s.name, sub: s.exam.name, to: `/subjects/${s.id}`, icon: BookOpen })),
      ...r.folders.map((f) => ({ key: `f${f.id}`, group: 'Folders', label: f.name, sub: f.subject.name, to: `/subjects/${f.subjectId}?folder=${f.id}`, icon: Folder })),
      ...r.playlists.map((p) => ({ key: `p${p.id}`, group: 'Playlists', label: p.title, to: `/playlists/${p.id}`, icon: ListVideo })),
      ...r.videos.map((v) => ({ key: `v${v.id}`, group: 'Lectures', label: v.title, to: `/watch/${v.id}`, icon: PlayCircle })),
    ];
  }, [results.data, debounced]);

  useEffect(() => setActive(0), [rows.length]);
  useEffect(() => {
    document.getElementById(`sr-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (row?: Row) => {
    if (!row) return;
    onClose();
    nav(row.to);
  };

  let lastGroup = '';
  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Search"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="palette-panel">
        <div className="palette-input">
          <Search size={18} aria-hidden />
          <input
            autoFocus
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="search-results"
            aria-activedescendant={rows.length ? `sr-${active}` : undefined}
            aria-label="Search your exams, subjects, folders, playlists and lectures"
            placeholder="Search your exams, subjects, folders, playlists and lectures…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(rows.length - 1, a + 1)));
              else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
              else if (e.key === 'Enter') go(rows[active]);
            }}
          />
          {results.isFetching && <Loader2 size={16} className="spin" aria-label="Searching" />}
        </div>
        <div id="search-results" role="listbox" className="palette-results" aria-label="Results">
          {!debounced && <p className="palette-hint">Type to search everything you have saved. Use ↑ ↓ and Enter.</p>}
          {debounced && !results.isFetching && rows.length === 0 && !results.isError && <p className="palette-hint">Nothing matches “{debounced}”.</p>}
          {results.isError && <p className="palette-hint">Search failed. Try again in a moment.</p>}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup ? ((lastGroup = r.group), <div className="palette-group" key={`g-${r.group}`}>{r.group}</div>) : null;
            return (
              <div key={r.key}>
                {head}
                <div id={`sr-${i}`} role="option" aria-selected={i === active} className={`palette-row ${i === active ? 'active' : ''}`} onMouseMove={() => setActive(i)} onClick={() => go(r)}>
                  <r.icon size={16} aria-hidden />
                  <span className="truncate">{r.label}</span>
                  {r.sub && <span className="palette-sub truncate">{r.sub}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
