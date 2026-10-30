import { ArrowRightLeft, ExternalLink, FolderPlus, ListVideo, MinusCircle, MoreHorizontal, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Breadcrumbs, Button, Checkbox, ConfirmDialog, Dialog, EmptyState, ErrorState, Menu, PageLoading, Progress, Segmented, TextArea, TextField, Thumb } from '@/components/ui';
import { MoveDialog } from '@/features/common/MoveDialog';
import { useAddPlacement, useMovePlacement, useRemovePlacement } from '@/features/subjects/queries';
import { VideoRow } from '@/features/videos/VideoRow';
import { useRemoveVideoFromPlaylist } from './queries';
import { useDialogs } from '@/lib/dialogs';
import { formatDate, locationText, plural } from '@/lib/format';
import { useDocumentTitle, useMeta } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import type { PlaylistDetail, Placement } from '@/lib/types';
import { filterSortVideos, nextUnwatched, watchUrl, type VideoFilter, type VideoSort } from './helpers';
import { useDeletePlaylist, usePlaylist, useSyncPlaylist, useUpdatePlaylist } from './queries';
import './playlists.css';

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
  const removeFromCollection = useRemoveVideoFromPlaylist();
  const [filter, setFilter] = useState<VideoFilter>('ALL');
  const [sort, setSort] = useState<VideoSort>('ORDER');
  const [modal, setModal] = useState<null | { kind: 'edit' } | { kind: 'delete' } | { kind: 'add' } | { kind: 'move'; p: Placement } | { kind: 'remove'; p: Placement }>(null);
  const pl = q.data;
  useDocumentTitle(pl?.title);

  const counts = useMemo(() => {
    const live = (pl?.videos ?? []).filter((v) => !v.removedFromSource);
    return { ALL: pl?.videos.length ?? 0, NOT_STARTED: live.filter((v) => v.status === 'NOT_STARTED').length, IN_PROGRESS: live.filter((v) => v.status === 'IN_PROGRESS').length, COMPLETED: live.filter((v) => v.status === 'COMPLETED').length };
  }, [pl]);
  const shown = useMemo(() => filterSortVideos(pl?.videos ?? [], filter, sort), [pl, filter, sort]);

  if (q.isLoading) return <PageLoading label="Loading playlist…" />;
  if (q.isError || !pl) return <ErrorState error={q.error} onRetry={() => q.refetch()} title={q.error && (q.error as any).status === 404 ? 'Playlist not found' : "We couldn't load this playlist"} />;

  const first = pl.placements[0];
  const next = nextUnwatched(pl.videos);
  const noKey = meta.data?.features.youtubeImport === false;
  const started = pl.stats.completed + pl.stats.inProgress > 0;

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
        toast.success(`Synchronised — ${bits.join(', ')}. Your progress was not changed.`);
      },
    });

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
        <label className="sort-select">
          Sort by
          <select className="input select" value={sort} onChange={(e) => setSort(e.target.value as VideoSort)}>
            <option value="ORDER">Original order</option>
            <option value="TITLE">Title</option>
            <option value="DURATION">Duration (longest)</option>
            <option value="STATUS">Completion status</option>
          </select>
        </label>
      </div>

      {pl.videos.length === 0 ? (
        <EmptyState icon={ListVideo} title="No videos yet" action={pl.isLocal ? <Button variant="primary" icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'video', playlistId: pl.id })}>Add a video</Button> : undefined}>
          {pl.isLocal ? 'Add videos to build this collection.' : 'This playlist had no videos when it was last synced.'}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={ListVideo} title="Nothing matches this filter" action={<Button onClick={() => setFilter('ALL')}>Show all videos</Button>} />
      ) : (
        <div role="list" aria-label="Videos">
          {shown.map((v) => (
            <div role="listitem" key={v.id}>
              <VideoRow
                video={v}
                playlistId={pl.id}
                index={sort === 'ORDER' && filter === 'ALL' ? (v.position ?? 0) + 1 : undefined}
                extraMenu={pl.isLocal ? [{ label: 'Remove from collection', icon: <MinusCircle size={16} />, danger: true, onSelect: () => removeFromCollection.mutate({ playlistId: pl.id, videoId: v.id }, { onSuccess: () => toast.success('Removed from this collection. The video stays in your library.') }) }] : []}
              />
            </div>
          ))}
        </div>
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
