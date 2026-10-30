import { ArrowDown, ArrowUp, BookOpen, FolderInput, FolderOpen, FolderPlus, LayoutGrid, List, ListVideo, MoreHorizontal, PanelLeft, Pencil, Plus, Trash2, Video as VideoIcon, Copy, Unlink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumbs, Button, CardSkeletons, ConfirmDialog, EmptyState, ErrorState, Menu, Progress, SelectField, Skeleton, type MenuItem } from '@/components/ui';
import { flattenFolders, useFolders } from '@/features/common/queries';
import { MoveDialog } from '@/features/common/MoveDialog';
import { VideoRow } from '@/features/videos/VideoRow';
import { ApiError } from '@/lib/api';
import { useDialogs } from '@/lib/dialogs';
import { plural } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import type { Destination, Folder, Playlist, Video } from '@/lib/types';
import { describeFolderDeletion } from './deletionCopy';
import type { DragPayload } from './dnd';
import { FolderCard } from './FolderCard';
import { FolderTree } from './FolderTree';
import { folderSubtreeIds, reorderedIds } from './folderTreeUtils';
import { PlaylistCard } from './PlaylistCard';
import { useAddPlacement, useDeleteFolder, useMoveFolder, useMovePlacement, useRemovePlacement, useReorderFolders, useSubjectContents } from './queries';
import { useSubjectActions } from './subjectActions';
import '@/features/exams/exams.css';
import './subjects.css';

type Pending =
  | { type: 'moveFolder'; folder: Folder }
  | { type: 'placement'; mode: 'move' | 'add'; kind: 'playlist' | 'video'; contentId: string; placementId?: string; title: string }
  | { type: 'deleteFolder'; folder: Folder }
  | { type: 'removePlacement'; kind: 'playlist' | 'video'; placementId: string; title: string };

const store = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
};

export default function SubjectPage() {
  const { subjectId } = useParams();
  const [sp, setSp] = useSearchParams();
  const folderId = sp.get('folder');
  const nav = useNavigate();
  const dialogs = useDialogs();
  const contents = useSubjectContents(subjectId, folderId);
  const folders = useFolders(subjectId);
  const subjectActions = useSubjectActions();

  const moveFolder = useMoveFolder();
  const reorderFolders = useReorderFolders();
  const deleteFolder = useDeleteFolder();
  const movePlacement = useMovePlacement();
  const addPlacement = useAddPlacement();
  const removePlacement = useRemovePlacement();

  const [view, setViewState] = useState<'grid' | 'list'>(() => (store('preppilot-view', 'grid') === 'list' ? 'list' : 'grid'));
  const [treeOpen, setTreeOpenState] = useState(() => store('preppilot-tree', '1') === '1');
  const [pending, setPending] = useState<Pending | null>(null);
  const setView = (v: 'grid' | 'list') => (setViewState(v), save('preppilot-view', v));
  const setTreeOpen = (v: boolean) => (setTreeOpenState(v), save('preppilot-tree', v ? '1' : '0'));

  const data = contents.data;
  useDocumentTitle(data ? (data.folder?.name ?? data.subject.name) : 'Subject');
  const allFolders = folders.data ?? [];
  const flat = useMemo(() => flattenFolders(allFolders), [allFolders]);
  const dest: Destination | null = subjectId ? { subjectId, folderId } : null;
  const goFolder = (id: string | null) => (id ? setSp({ folder: id }) : setSp({}));

  if (contents.isLoading)
    return (
      <>
        <Skeleton style={{ height: 150, marginBottom: 20 }} />
        <CardSkeletons count={3} height={140} />
      </>
    );
  if (contents.isError) {
    const missing = contents.error instanceof ApiError && (contents.error.status === 404 || contents.error.status === 422);
    return missing ? (
      <EmptyState icon={BookOpen} title="We couldn’t find that subject or folder" action={<Button onClick={() => nav('/exams')}>Back to my exams</Button>}>
        It may have been moved or deleted.
      </EmptyState>
    ) : (
      <ErrorState error={contents.error} onRetry={() => contents.refetch()} title="Couldn’t load this subject" />
    );
  }
  const { subject, exam, folder, breadcrumb } = data!;
  const stats = folder ? (allFolders.find((f) => f.id === folder.id)?.stats ?? subject.stats) : subject.stats;
  const here = folder ? 'this folder' : 'this subject';
  const empty = data!.folders.length === 0 && data!.playlists.length === 0 && data!.videos.length === 0;

  const handleDrop = (target: string | null, p: DragPayload) => {
    if (p.kind === 'folder') {
      if (p.id === target) return;
      moveFolder.mutate({ id: p.id, parentFolderId: target, subjectId: subject.id }, { onSuccess: () => toast.success('Folder moved') });
    } else {
      movePlacement.mutate({ type: p.kind, id: p.placementId, subjectId: subject.id, folderId: target }, { onSuccess: () => toast.success('Moved') });
    }
  };


  const placementMenu = (kind: 'playlist' | 'video', content: Playlist | Video): MenuItem[] => {
    const placementId = content.placementId;
    const title = content.title;
    return [
      ...(placementId ? [{ label: 'Move to…', icon: <FolderInput size={16} />, onSelect: () => setPending({ type: 'placement', mode: 'move', kind, contentId: content.id, placementId, title }) }] : []),
      { label: 'Also add to another folder…', icon: <Copy size={16} />, onSelect: () => setPending({ type: 'placement', mode: 'add', kind, contentId: content.id, title }) },
      ...(placementId ? [{ label: `Remove from ${here}…`, icon: <Unlink size={16} />, danger: true, separated: true, onSelect: () => setPending({ type: 'removePlacement', kind, placementId, title }) }] : []),
    ];
  };

  let dialogNode: React.ReactNode = null;
  if (pending?.type === 'moveFolder') {
    const f = pending.folder;
    dialogNode = (
      <MoveDialog
        title={`Move “${f.name}”`}
        description="Pick a new parent folder, or the subject itself to move it to the top level."
        initial={{ subjectId: subject.id, folderId: f.parentFolderId }}
        excludeFolderIds={folderSubtreeIds(allFolders, f.id)}
        onClose={() => setPending(null)}
        onConfirm={async (d) => {
          await moveFolder.mutateAsync({ id: f.id, parentFolderId: d.folderId, subjectId: d.subjectId });
          toast.success(`“${f.name}” moved`);
        }}
      />
    );
  } else if (pending?.type === 'placement') {
    const p = pending;
    dialogNode = (
      <MoveDialog
        title={p.mode === 'move' ? `Move “${p.title}”` : `Add “${p.title}” to another folder`}
        description={p.mode === 'move' ? undefined : 'It will appear in both places; progress is shared because it is the same lecture.'}
        initial={dest}
        confirmLabel={p.mode === 'move' ? 'Move here' : 'Add here'}
        onClose={() => setPending(null)}
        onConfirm={async (d) => {
          if (p.mode === 'move') await movePlacement.mutateAsync({ type: p.kind, id: p.placementId!, subjectId: d.subjectId, folderId: d.folderId });
          else await addPlacement.mutateAsync({ type: p.kind, contentId: p.contentId, subjectId: d.subjectId, folderId: d.folderId });
          toast.success(p.mode === 'move' ? 'Moved' : 'Added');
        }}
      />
    );
  } else if (pending?.type === 'deleteFolder') {
    const f = pending.folder;
    const d = describeFolderDeletion(f);
    dialogNode = (
      <ConfirmDialog
        title={`Delete folder “${f.name}”?`}
        confirmLabel="Delete folder"
        danger
        onClose={() => setPending(null)}
        onConfirm={async () => {
          await deleteFolder.mutateAsync(f.id);
          toast.success(`Folder “${f.name}” deleted`);
        }}
      >
        <p>It will remove:</p>
        <ul>
          {d.removes.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p>
          {d.kept} {d.uniqueVideos > 0 && `(${plural(d.uniqueVideos, 'video')} are filed inside.)`}
        </p>
      </ConfirmDialog>
    );
  } else if (pending?.type === 'removePlacement') {
    const p = pending;
    dialogNode = (
      <ConfirmDialog
        title={`Remove “${p.title}” from ${here}?`}
        confirmLabel="Remove from here"
        danger
        onClose={() => setPending(null)}
        onConfirm={async () => {
          await removePlacement.mutateAsync({ type: p.kind, id: p.placementId });
          toast.success('Removed from here');
        }}
      >
        <p>
          Only the link in {here} is removed. The {p.kind} stays in your library, keeps its progress, notes and favorites, and any other place it is filed.
        </p>
      </ConfirmDialog>
    );
  }

  const crumbs = [
    { label: 'My exams', to: '/exams' },
    { label: exam.name, to: `/exams/${exam.id}` },
    { label: subject.name, to: `/subjects/${subject.id}` },
    ...breadcrumb.map((b) => ({ label: b.name, to: `/subjects/${subject.id}?folder=${b.id}` })),
  ];

  const main = (
    <div className={view === 'list' ? 'is-list' : ''}>
      <div className="jump-folder">
        <SelectField label="Jump to folder" value={folderId ?? ''} onChange={(e) => goFolder(e.target.value || null)}>
          <option value="">{subject.name} (top level)</option>
          {flat.map((f) => (
            <option key={f.id} value={f.id}>
              {' '.repeat(f.depth)}
              {f.depth ? '↳ ' : ''}
              {f.name}
            </option>
          ))}
        </SelectField>
      </div>

      {empty ? (
        <EmptyState
          icon={folder ? FolderOpen : BookOpen}
          title={folder ? 'This folder is empty' : 'Nothing in this subject yet'}
          action={
            <>
              <Button icon={<FolderPlus size={16} />} onClick={() => dialogs.open({ kind: 'folder', subjectId: subject.id, parentFolderId: folderId })}>
                New folder
              </Button>
              <Button variant="primary" icon={<ListVideo size={16} />} onClick={() => dialogs.open({ kind: 'import', destination: dest })}>
                Import playlist
              </Button>
              <Button icon={<VideoIcon size={16} />} onClick={() => dialogs.open({ kind: 'video', destination: dest })}>
                Add video
              </Button>
            </>
          }
        >
          Organise with folders, import a YouTube playlist, or add a single video.
        </EmptyState>
      ) : (
        <>
          {data!.folders.length > 0 && (
            <section className="ws-section" style={{ marginTop: 0 }} aria-labelledby="sec-folders">
              <h2 id="sec-folders">
                Folders <span className="count-pill">{data!.folders.length}</span>
              </h2>
              <div className="folder-grid">
                {data!.folders.map((f) => (
                  <FolderCard key={f.id} folder={f} subjectId={subject.id} onDropOn={handleDrop} menu={folderMenuItems(f)} />
                ))}
              </div>
            </section>
          )}
          {data!.playlists.length > 0 && (
            <section className="ws-section" aria-labelledby="sec-playlists">
              <h2 id="sec-playlists">
                Playlists <span className="count-pill">{data!.playlists.length}</span>
              </h2>
              <div className="playlist-grid">
                {data!.playlists.map((p) => (
                  <PlaylistCard key={p.id} playlist={p} menu={[{ label: 'Open', icon: <FolderOpen size={16} />, onSelect: () => nav(`/playlists/${p.id}`) }, ...placementMenu('playlist', p)]} />
                ))}
              </div>
            </section>
          )}
          {data!.videos.length > 0 && (
            <section className="ws-section" aria-labelledby="sec-videos">
              <h2 id="sec-videos">
                Videos <span className="count-pill">{data!.videos.length}</span>
              </h2>
              <div className="video-list">
                {data!.videos.map((v, i) => (
                  <div key={v.id} className="draggable" {...(v.placementId ? dragProps(v) : {})}>
                    <VideoRow video={v} index={i + 1} showLocation={false} extraMenu={placementMenu('video', v)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );

  function folderMenuItems(f: Folder): MenuItem[] {
    const ids = data!.folders.map((x) => x.id);
    const up = reorderedIds(ids, f.id, -1);
    const down = reorderedIds(ids, f.id, 1);
    const items: MenuItem[] = [
      { label: 'Open', icon: <FolderOpen size={16} />, onSelect: () => goFolder(f.id) },
      { label: 'Rename…', icon: <Pencil size={16} />, onSelect: () => dialogs.open({ kind: 'folder', folder: f }) },
      { label: 'New sub-folder…', icon: <FolderPlus size={16} />, onSelect: () => dialogs.open({ kind: 'folder', subjectId: subject.id, parentFolderId: f.id }) },
      { label: 'Move to…', icon: <FolderInput size={16} />, onSelect: () => setPending({ type: 'moveFolder', folder: f }) },
    ];
    if (up) items.push({ label: 'Move up', icon: <ArrowUp size={16} />, onSelect: () => reorderFolders.mutate(up), separated: true });
    if (down) items.push({ label: 'Move down', icon: <ArrowDown size={16} />, onSelect: () => reorderFolders.mutate(down), separated: !up });
    items.push({ label: 'Delete…', icon: <Trash2 size={16} />, danger: true, separated: true, onSelect: () => setPending({ type: 'deleteFolder', folder: f }) });
    return items;
  }

  return (
    <>
      <Breadcrumbs items={crumbs} />
      <section className="ws-head" aria-labelledby="ws-title">
        <div className="ws-head-top">
          <div className="ws-title">
            <div className="eyebrow">{folder ? `${exam.name} › ${subject.name}` : exam.name}</div>
            <h1 id="ws-title">{folder?.name ?? subject.name}</h1>
            {(folder?.description ?? subject.description) && <p className="page-desc">{folder?.description ?? subject.description}</p>}
          </div>
          <Menu
            label="Subject actions"
            trigger={<MoreHorizontal size={18} />}
            items={subjectActions.items(subject, { hideOpen: true, onDeleted: () => nav(`/exams/${exam.id}`, { replace: true }) })}
          />
        </div>
        <div className="progress-line">
          <div className="progress-line-head">
            <span>
              {stats.completed} of {plural(stats.total, 'video')} completed
              {stats.inProgress > 0 && ` · ${stats.inProgress} in progress`}
            </span>
            <b>{stats.percent}%</b>
          </div>
          <Progress value={stats.percent} label={`${folder?.name ?? subject.name} progress`} size="lg" />
        </div>
        <div className="ws-toolbar">
          <Button icon={<FolderPlus size={16} />} onClick={() => dialogs.open({ kind: 'folder', subjectId: subject.id, parentFolderId: folderId })}>
            New folder
          </Button>
          <Button variant="primary" icon={<ListVideo size={16} />} onClick={() => dialogs.open({ kind: 'import', destination: dest })}>
            Import playlist
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => dialogs.open({ kind: 'video', destination: dest })}>
            Add video
          </Button>
          <span className="spacer" />
          <button type="button" className="icon-btn tree-toggle-btn" aria-pressed={treeOpen} aria-label={treeOpen ? 'Hide folder tree' : 'Show folder tree'} title={treeOpen ? 'Hide folder tree' : 'Show folder tree'} onClick={() => setTreeOpen(!treeOpen)}>
            <PanelLeft size={18} />
          </button>
          <div className="view-toggle" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => setView('grid')}>
              <LayoutGrid size={16} />
            </button>
            <button type="button" aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => setView('list')}>
              <List size={16} />
            </button>
          </div>
        </div>
      </section>

      <div className={`workspace ${treeOpen ? '' : 'tree-hidden'}`}>
        {treeOpen && (
          <aside className="tree-panel" aria-label="Folder tree">
            <div className="tree-head">Folders</div>
            <FolderTree subjectId={subject.id} subjectName={subject.name} folders={allFolders} currentFolderId={folderId} onDropOn={handleDrop} />
          </aside>
        )}
        <div className="workspace-main">{main}</div>
      </div>
      {dialogNode}
      {subjectActions.dialogNode}
    </>
  );

  function dragProps(v: Video) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData('application/x-preppilot-item', JSON.stringify({ kind: 'video', id: v.id, placementId: v.placementId }));
        e.dataTransfer.effectAllowed = 'move';
      },
    };
  }
}

