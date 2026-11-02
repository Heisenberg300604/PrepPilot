import { ArrowDown, ArrowRightLeft, ArrowUp, CheckSquare, ChevronsDown, ChevronsUp, GripVertical, ExternalLink, FolderPlus, ListVideo, MinusCircle, MoreHorizontal, Pencil, Play, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumbs, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Menu, PageLoading, Progress, Segmented, TextArea, TextField, Thumb, type MenuItem } from '@/components/ui';
import { MoveDialog } from '@/features/common/MoveDialog';
import { useAddPlacement, useMovePlacement, useRemovePlacement } from '@/features/subjects/queries';
import { VideoRow } from '@/features/videos/VideoRow';
import { useDialogs } from '@/lib/dialogs';
import { formatDate, locationText, plural } from '@/lib/format';
import { useDocumentTitle, useMeta } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import type { PlaylistDetail, Placement, Video } from '@/lib/types';
import { filterSortVideos, moveRelative, nextUnwatched, watchUrl, type VideoFilter, type VideoSort } from './helpers';
import { useDeletePlaylist, usePlaylist, useRemovePlaylistVideos, useReorderPlaylist, useResetPlaylistOrder, useRestorePlaylistVideos, useSyncPlaylist, useUpdatePlaylist } from './queries';
import './playlists.css';

// Per-viewer view preference; storage can be unavailable (private mode), so default to on.
const COMPLETED_LAST_KEY = 'preppilot.completedLast';
const readCompletedLast = () => {
  try {
    return localStorage.getItem(COMPLETED_LAST_KEY) !== 'false';
  } catch {
    return true;
  }
};
const ORDER_MIME = 'application/x-preppilot-order';

const placementLink = (p: Placement) => `/subjects/${p.subjectId}${p.folderId ? `?folder=${p.folderId}` : ''}`;

function EditDialog({ playlist, onClose }: { playlist: PlaylistDetail; onClose: () => void }) {
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState(playlist.description ?? '');
  const update = useUpdatePlaylist();
  return (
    <Dialog
      title="Edit playlist details"
      description="These changes apply only inside PrepPilot. Your playlist on YouTube is not changed."
      onClose={onClose}
      busy={update.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-playlist" loading={update.isPending}>Save</Button>
        </>
      }
    >
      <form
        id="edit-playlist"
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          update.mutate({ id: playlist.id, title: title.trim(), description: description.trim() || null }, { onSuccess: () => (toast.success('Playlist updated in PrepPilot'), onClose()) });
        }}
      >
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus error={title.trim() ? null : 'Enter a title.'} />
        <TextArea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </form>
    </Dialog>
  );
}

function DeleteDialog({ playlist, onClose, onDeleted }: { playlist: PlaylistDetail; onClose: () => void; onDeleted: () => void }) {
  const [prune, setPrune] = useState(false);
  const del = useDeletePlaylist();
  return (
    <ConfirmDialog
      title="Delete this playlist?"
      confirmLabel="Delete playlist"
      danger
      onClose={onClose}
      onConfirm={async () => {
        const r = await del.mutateAsync({ id: playlist.id, deleteOrphanVideos: prune });
        toast.success(r.removedVideos ? `Playlist deleted along with ${plural(r.removedVideos, 'unused video')}.` : 'Playlist deleted. Its videos are still in your library.');
        onDeleted();
      }}
    >
      <p>
        “{playlist.title}” will be removed from PrepPilot and from every folder it appears in. It does not affect the playlist on YouTube.
      </p>
      <p>The videos, with their progress, notes and favourites, stay in your library unless you choose otherwise:</p>
      <Checkbox checked={prune} onChange={(e) => setPrune(e.target.checked)} label="Also delete videos that are only in this playlist and have no progress, notes or favourites" />
    </ConfirmDialog>
  );
}

export default function PlaylistPage() {
  const { playlistId } = useParams();
  const q = usePlaylist(playlistId);
  const meta = useMeta();
  const nav = useNavigate();
  const dialogs = useDialogs();
  const sync = useSyncPlaylist();
  const move = useMovePlacement();
  const addPlacement = useAddPlacement();
  const removePlacement = useRemovePlacement();
  const removeVideos = useRemovePlaylistVideos();
  const restoreVideos = useRestorePlaylistVideos();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<VideoFilter>('ALL');
  const [sort, setSort] = useState<VideoSort>('ORDER');
  const [completedLast, setCompletedLastState] = useState(readCompletedLast);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ id: string; where: 'before' | 'after' } | null>(null);
  const reorder = useReorderPlaylist(playlistId ?? '');
  const resetOrder = useResetPlaylistOrder();
  const setCompletedLast = (on: boolean) => {
    setCompletedLastState(on);
    try {
      localStorage.setItem(COMPLETED_LAST_KEY, String(on));
    } catch {
      /* preference just won't persist */
    }
  };
  const [modal, setModal] = useState<null | { kind: 'edit' } | { kind: 'delete' } | { kind: 'add' } | { kind: 'move'; p: Placement } | { kind: 'remove'; p: Placement } | { kind: 'removeVideos'; ids: string[] }>(null);
  const pl = q.data;
  useDocumentTitle(pl?.title);

  const counts = useMemo(() => {
    const live = (pl?.videos ?? []).filter((v) => !v.removedFromSource);
    return { ALL: pl?.videos.length ?? 0, NOT_STARTED: live.filter((v) => v.status === 'NOT_STARTED').length, IN_PROGRESS: live.filter((v) => v.status === 'IN_PROGRESS').length, COMPLETED: live.filter((v) => v.status === 'COMPLETED').length };
  }, [pl]);
  const shown = useMemo(() => filterSortVideos(pl?.videos ?? [], filter, sort, completedLast), [pl, filter, sort, completedLast]);

  if (q.isLoading) return <PageLoading label="Loading playlist…" />;
  if (q.isError || !pl) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error && (q.error as any).status === 404 ? 'Playlist not found' : "We couldn't load this playlist"} />;

  const first = pl.placements[0];
  const next = nextUnwatched(pl.videos);
  const noKey = meta.data?.features.youtubeImport === false;
  const started = pl.stats.completed + pl.stats.inProgress > 0;

  // ── reordering ── only in the plain "All + playlist order" view, so what you drag is what gets saved.
  const savedOrder = pl.videos.filter((v) => !v.removedFromSource).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((v) => v.id);
  const canReorder = sort === 'ORDER' && filter === 'ALL' && !selecting && savedOrder.length > 1;
  const shownLive = shown.filter((v) => !v.removedFromSource);
  // With "completed at the end" on, moves stay within a video's group (unfinished / finished), as the view would undo anything else.
  const group = (v: Video) => (completedLast && v.status === 'COMPLETED' ? 1 : 0);
  const peers = (v: Video) => shownLive.filter((x) => group(x) === group(v));
  const moveTo = (id: string, targetId: string, where: 'before' | 'after') => {
    const next = moveRelative(savedOrder, id, targetId, where);
    if (next.some((x, i) => x !== savedOrder[i])) reorder.mutate(next);
  };
  const orderMenu = (v: Video): MenuItem[] => {
    if (!canReorder || v.removedFromSource) return [];
    const list = peers(v);
    const i = list.findIndex((x) => x.id === v.id);
    const items: MenuItem[] = [];
    if (i > 0) {
      items.push({ label: 'Move to top', icon: <ChevronsUp size={16} />, onSelect: () => moveTo(v.id, list[0].id, 'before') });
      items.push({ label: 'Move up', icon: <ArrowUp size={16} />, onSelect: () => moveTo(v.id, list[i - 1].id, 'before') });
    }
    if (i < list.length - 1) {
      items.push({ label: 'Move down', icon: <ArrowDown size={16} />, onSelect: () => moveTo(v.id, list[i + 1].id, 'after') });
      items.push({ label: 'Move to bottom', icon: <ChevronsDown size={16} />, onSelect: () => moveTo(v.id, list[list.length - 1].id, 'after') });
    }
    return items;
  };
  const dropProps = (v: Video) => {
    if (!canReorder || v.removedFromSource) return {};
    const accepts = (e: DragEvent) => e.dataTransfer.types.includes(ORDER_MIME) && dragId != null && dragId !== v.id && group(shownLive.find((x) => x.id === dragId)!) === group(v);
    return {
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        if (!accepts(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = e.currentTarget.getBoundingClientRect();
        const where = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
        if (dropHint?.id !== v.id || dropHint.where !== where) setDropHint({ id: v.id, where });
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHint((h) => (h?.id === v.id ? null : h));
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        if (!accepts(e)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        moveTo(dragId!, v.id, e.clientY < r.top + r.height / 2 ? 'before' : 'after');
        setDropHint(null);
        setDragId(null);
      },
    };
  };

  const crumbs = [
    { label: 'My exams', to: '/exams' },
    ...(first?.examId ? [{ label: first.examName ?? 'Exam', to: `/exams/${first.examId}` }] : []),
    ...(first?.subjectId ? [{ label: first.subjectName ?? 'Subject', to: `/subjects/${first.subjectId}` }] : []),
    { label: pl.title },
  ];

  const doSync = () =>
    sync.mutate(pl.id, {
      onSuccess: (r) => {
        const bits = [`${plural(r.newVideos, 'new video')}`];
        if (r.removedFromSource) bits.push(`${plural(r.removedFromSource, 'video')} no longer in the YouTube playlist (kept, flagged)`);
        if (r.skippedDuplicates) bits.push(`${plural(r.skippedDuplicates, 'video')} skipped because ${r.skippedDuplicates === 1 ? 'it is' : 'they are'} already in your library (see “Removed videos”)`);
        toast.success(`Synchronised — ${bits.join(', ')}. Your progress was not changed.`);
      },
    });

  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const togglePick = (id: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  /** Restore removed videos by re-syncing; offered as an Undo right after a removal. */
  const restore = (youtubeVideoIds: string[]) =>
    restoreVideos.mutate(
      { playlistId: pl.id, youtubeVideoIds },
      { onSuccess: (r) => toast.success(`Restored ${plural(r.addedItems, 'video')} to this playlist.`) },
    );
  const removeNow = (ids: string[], then?: () => void) => {
    const ytIds = pl.videos.filter((v) => ids.includes(v.id) && v.youtubeVideoId).map((v) => v.youtubeVideoId!);
    return removeVideos.mutateAsync({ playlistId: pl.id, videoIds: ids }).then((r) => {
      then?.();
      const msg = pl.isLocal
        ? `Removed ${plural(r.removed, 'video')} from this collection. They stay in your library.`
        : `Removed ${plural(r.removed, 'video')} from this playlist. Sync will not add ${r.removed === 1 ? 'it' : 'them'} back.`;
      toast.success(msg, r.restorable && !noKey ? { label: 'Undo', onClick: () => restore(ytIds) } : undefined);
    });
  };

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <section className="pl-hero" aria-labelledby="pl-title">
        <Thumb src={pl.thumbnailUrl} alt="" />
        <div className="pl-hero-body">
          <div>
            <div className="eyebrow">{pl.isLocal ? 'Local collection' : 'YouTube playlist'}</div>
            <h1 id="pl-title">{pl.title}</h1>
            {pl.channelTitle && <p className="muted">{pl.channelTitle}</p>}
          </div>
          {pl.description && <p className="pl-desc">{pl.description}</p>}
          <div className="pl-stats">
            <span><strong>{pl.stats.total}</strong> tracked</span>
            <span><strong>{pl.stats.completed}</strong> completed</span>
            <span><strong>{pl.stats.remaining}</strong> remaining</span>
            {pl.lastSyncedAt && <span>Synced {formatDate(pl.lastSyncedAt.slice(0, 10))}</span>}
          </div>
          <div className="pl-progress">
            <div className="pl-progress-label"><span>Progress</span><span>{pl.stats.percent}%</span></div>
            <Progress value={pl.stats.percent} label={`${pl.title} progress`} size="lg" />
          </div>
          <div className="row row-wrap">
            <Button variant="primary" icon={<Play size={16} />} disabled={!next} onClick={() => next && nav(watchUrl(next.id, pl.id))}>
              {started ? 'Continue' : 'Start watching'}
            </Button>
            {!pl.isLocal && (
              <Button icon={<RefreshCw size={16} />} onClick={doSync} loading={sync.isPending} disabled={noKey} title={noKey ? 'Needs YOUTUBE_API_KEY on the server' : 'Fetch the latest videos from YouTube'}>
                Sync from YouTube
              </Button>
            )}
            {pl.isLocal && <Button icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'video', playlistId: pl.id, destination: first?.subjectId ? { subjectId: first.subjectId, folderId: first.folderId ?? null } : null })}>Add video</Button>}
            <Menu
              label="More playlist actions"
              triggerClassName="btn btn-secondary"
              trigger={<><MoreHorizontal size={16} aria-hidden /> More</>}
              items={[
                { label: 'Edit title & description', icon: <Pencil size={16} />, onSelect: () => setModal({ kind: 'edit' }) },
                { label: 'Add to another location', icon: <FolderPlus size={16} />, onSelect: () => setModal({ kind: 'add' }) },
                ...(pl.sourceUrl ? [{ label: 'Open on YouTube', icon: <ExternalLink size={16} />, onSelect: () => window.open(pl.sourceUrl!, '_blank', 'noopener') }] : []),
                ...(pl.customOrder && !pl.isLocal && !noKey
                  ? [{ label: 'Reset to YouTube order', icon: <RotateCcw size={16} />, onSelect: () => resetOrder.mutate(pl.id, { onSuccess: () => sync.mutate(pl.id, { onSuccess: () => toast.success('Back in YouTube order') }) }) }]
                  : []),
                { label: 'Delete playlist', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: () => setModal({ kind: 'delete' }) },
              ]}
            />
          </div>
          {!pl.isLocal && noKey && <p className="local-note">Syncing needs a YouTube API key on the server. Your imported videos still work normally.</p>}
          {!pl.isLocal && <p className="local-note">Title and description edits are local to PrepPilot — they never change the playlist on YouTube.</p>}
          <div>
            <h2 style={{ fontSize: 15, margin: '4px 0 8px' }}>Where it lives</h2>
            {pl.placements.length === 0 ? (
              <p className="muted">Not filed under any exam yet. <button className="btn btn-ghost btn-sm" onClick={() => setModal({ kind: 'add' })}>File it</button></p>
            ) : (
              <ul className="pl-locations">
                {pl.placements.map((p) => (
                  <li key={p.id}>
                    <span className="truncate">{locationText(p as any)}</span>
                    <Link className="btn btn-ghost btn-sm" to={placementLink(p)}>Open</Link>
                    <Menu
                      label={`Actions for location ${locationText(p as any)}`}
                      trigger={<MoreHorizontal size={16} />}
                      items={[
                        { label: 'Move to…', icon: <ArrowRightLeft size={16} />, onSelect: () => setModal({ kind: 'move', p }) },
                        { label: 'Remove from here', icon: <MinusCircle size={16} />, danger: true, onSelect: () => setModal({ kind: 'remove', p }) },
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div className="pl-toolbar">
        <Segmented
          label="Filter videos by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: counts.ALL },
            { value: 'NOT_STARTED', label: 'Not started', count: counts.NOT_STARTED },
            { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS },
            { value: 'COMPLETED', label: 'Completed', count: counts.COMPLETED },
          ]}
        />
        <Button size="sm" variant={selecting ? 'primary' : 'secondary'} icon={selecting ? <X size={15} /> : <CheckSquare size={15} />} onClick={() => (selecting ? stopSelecting() : setSelecting(true))} aria-pressed={selecting}>
          {selecting ? 'Done' : 'Select videos'}
        </Button>
        <Checkbox checked={completedLast} onChange={(e) => setCompletedLast(e.target.checked)} label="Completed at the end" />
        <label className="sort-select">
          Sort by
          <select className="input select" value={sort} onChange={(e) => setSort(e.target.value as VideoSort)}>
            <option value="ORDER">{pl.customOrder ? 'Your order' : 'Original order'}</option>
            <option value="TITLE">Title</option>
            <option value="DURATION">Duration (longest)</option>
            <option value="STATUS">Completion status</option>
          </select>
        </label>
      </div>

      {pl.videos.length === 0 ? (
        <EmptyState icon={ListVideo} title="No videos yet" action={pl.isLocal ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'video', playlistId: pl.id })}>Add a video</Button> : undefined}>
          {pl.isLocal ? 'Add videos to build this collection.' : pl.excludedVideos.length > 0 ? 'You removed every video from this playlist. Restore any of them from “Removed videos” below.' : 'This playlist had no videos when it was last synced.'}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={ListVideo} title="Nothing matches this filter" action={<Button onClick={() => setFilter('ALL')}>Show all videos</Button>} />
      ) : (
        <>
          {selecting && (
            <div className="select-bar" role="region" aria-label="Bulk actions">
              <span role="status" aria-live="polite">
                <strong>{picked.size}</strong> selected
              </span>
              <span className="row row-wrap">
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map((v) => v.id)))} disabled={shown.length === 0 || picked.size === shown.length}>
                  Select all {filter === 'ALL' ? '' : 'shown'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
                  Clear
                </Button>
                <Button size="sm" variant="danger" icon={<Trash2 size={15} />} disabled={picked.size === 0} onClick={() => setModal({ kind: 'removeVideos', ids: [...picked] })}>
                  Remove from {pl.isLocal ? 'collection' : 'playlist'}
                </Button>
              </span>
            </div>
          )}
          <div role="list" aria-label="Videos">
            {shown.map((v) => (
              <div
                role="listitem"
                key={v.id}
                className={`sel-row ${selecting ? 'is-selecting' : ''} ${picked.has(v.id) ? 'is-picked' : ''} ${canReorder && !v.removedFromSource ? 'is-sortable' : ''} ${dragId === v.id ? 'is-dragging' : ''} ${dropHint?.id === v.id ? `drop-${dropHint.where}` : ''}`}
                {...dropProps(v)}
              >
                {selecting && <input type="checkbox" className="sel-check" checked={picked.has(v.id)} onChange={() => togglePick(v.id)} aria-label={`Select ${v.title}`} />}
                {canReorder && !v.removedFromSource && (
                  <span
                    className="drag-handle"
                    draggable
                    title="Drag to reorder"
                    aria-hidden
                    onDragStart={(e) => {
                      e.dataTransfer.setData(ORDER_MIME, v.id);
                      e.dataTransfer.effectAllowed = 'move';
                      const row = e.currentTarget.parentElement;
                      if (row) e.dataTransfer.setDragImage(row, 24, 24);
                      setDragId(v.id);
                    }}
                    onDragEnd={() => (setDragId(null), setDropHint(null))}
                  >
                    <GripVertical size={18} />
                  </span>
                )}
                <VideoRow
                  video={v}
                  playlistId={pl.id}
                  index={sort === 'ORDER' && filter === 'ALL' ? (v.position ?? 0) + 1 : undefined}
                  extraMenu={[
                    ...orderMenu(v),
                    {
                      label: pl.isLocal ? 'Remove from collection' : 'Remove from this playlist',
                      icon: <MinusCircle size={16} />,
                      danger: true,
                      separated: true,
                      onSelect: () => (v.status === 'NOT_STARTED' && !v.favorite ? removeNow([v.id]) : setModal({ kind: 'removeVideos', ids: [v.id] })),
                    },
                  ]}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {!pl.isLocal && pl.excludedVideos.length > 0 && (
        <details className="removed-panel">
          <summary>
            <RotateCcw size={15} aria-hidden /> Removed videos <span className="seg-count">{pl.excludedVideos.length}</span>
          </summary>
          <p className="muted small">These are left out of this playlist and will not come back when you sync. Restore any you want to bring back{noKey ? ' (needs a YouTube API key on the server)' : ''}.</p>
          <ul>
            {pl.excludedVideos.map((e) => (
              <li key={e.youtubeVideoId}>
                <Thumb src={e.thumbnailUrl} />
                <span className="truncate" title={e.title}>{e.title}</span>
                <Button size="sm" onClick={() => restore([e.youtubeVideoId])} disabled={noKey || restoreVideos.isPending} aria-label={`Restore ${e.title}`}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
          {pl.excludedVideos.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => restore(pl.excludedVideos.map((e) => e.youtubeVideoId))} disabled={noKey || restoreVideos.isPending}>
              Restore all
            </Button>
          )}
        </details>
      )}

      {modal?.kind === 'removeVideos' && (
        <ConfirmDialog
          title={`Remove ${plural(modal.ids.length, 'video')} from this ${pl.isLocal ? 'collection' : 'playlist'}?`}
          confirmLabel="Remove"
          danger
          onClose={() => setModal(null)}
          onConfirm={() => removeNow(modal.ids, stopSelecting)}
        >
          {(() => {
            const chosen = pl.videos.filter((v) => modal.ids.includes(v.id));
            const withHistory = chosen.filter((v) => v.status !== 'NOT_STARTED' || v.favorite).length;
            return (
              <>
                <p>
                  {pl.isLocal ? 'They will no longer be in this collection, but stay in your library.' : 'They will no longer appear in this playlist, and syncing from YouTube will not add them back. You can restore them later from “Removed videos”.'}
                </p>
                {withHistory > 0 && <p>{plural(withHistory, 'of these videos has', 'of these videos have')} progress or a favourite. {pl.isLocal ? '' : 'That history is kept, and returns if you restore the video.'}</p>}
                <p>This only changes PrepPilot. Nothing is changed on YouTube.</p>
              </>
            );
          })()}
        </ConfirmDialog>
      )}
      {modal?.kind === 'edit' && <EditDialog playlist={pl} onClose={() => setModal(null)} />}
      {modal?.kind === 'delete' && <DeleteDialog playlist={pl} onClose={() => setModal(null)} onDeleted={() => nav('/library')} />}
      {modal?.kind === 'add' && (
        <MoveDialog
          title="Add to another location"
          description="The playlist will appear in both places. Progress is shared, and videos are counted once."
          confirmLabel="Add here"
          onClose={() => setModal(null)}
          onConfirm={async (d) => {
            await addPlacement.mutateAsync({ type: 'playlist', contentId: pl.id, subjectId: d.subjectId, folderId: d.folderId });
            toast.success('Playlist added to that location.');
          }}
        />
      )}
      {modal?.kind === 'move' && (
        <MoveDialog
          title="Move playlist"
          description={`Currently in ${locationText(modal.p as any)}.`}
          initial={modal.p.subjectId ? { subjectId: modal.p.subjectId, folderId: modal.p.folderId ?? null } : null}
          onClose={() => setModal(null)}
          onConfirm={async (d) => {
            await move.mutateAsync({ type: 'playlist', id: modal.p.id, subjectId: d.subjectId, folderId: d.folderId });
            toast.success('Playlist moved.');
          }}
        />
      )}
      {modal?.kind === 'remove' && (
        <ConfirmDialog
          title="Remove from this location?"
          confirmLabel="Remove"
          danger
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await removePlacement.mutateAsync({ type: 'playlist', id: modal.p.id });
            toast.success('Removed from that location. The playlist is still in your library.');
          }}
        >
          <p>“{pl.title}” will no longer appear in {locationText(modal.p as any)}.</p>
          <p>The playlist, its videos and your progress are kept.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
