import { AlertTriangle, Info, ListVideo } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, TextField, Thumb } from '@/components/ui';
import { DestinationPicker } from '@/features/common/DestinationPicker';
import { useDialogs } from '@/lib/dialogs';
import { formatDuration, plural } from '@/lib/format';
import { useMeta } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import type { Destination, PlaylistPreview } from '@/lib/types';
import { parsePlaylistUrl } from '@/features/videos/youtubeUrl';
import { allSelected, importErrorMessage, importLabel, initialSelection, setRange, toggleId } from './helpers';
import { useImportPlaylist, usePreviewPlaylist } from './queries';
import './playlists.css';

export default function ImportPlaylistDialog({ destination = null, onClose }: { destination?: Destination | null; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<PlaylistPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastClicked = useRef<number | null>(null);
  const [dest, setDest] = useState<Destination | null>(destination);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const duplicateIds = new Set(preview?.duplicateVideoIds ?? []);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [destError, setDestError] = useState<string | null>(null);
  const meta = useMeta();
  const dialogs = useDialogs();
  const nav = useNavigate();
  const previewMut = usePreviewPlaylist();
  const importMut = useImportPlaylist();
  const unconfigured = meta.data?.features.youtubeImport === false;
  const busy = previewMut.isPending || importMut.isPending;

  const runPreview = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!parsePlaylistUrl(url)) return setFieldError('Paste a YouTube playlist link containing "list=…". Private lists such as Watch later cannot be imported.');
    setFieldError(null);
    setPreview(null);
    previewMut.mutate(
      { url: url.trim() },
      {
        onSuccess: (p) => {
          setPreview(p);
          setSelected(initialSelection(p.videos, [...p.excludedVideoIds, ...p.duplicateVideoIds]));
          lastClicked.current = null;
        },
        onError: (err) => setError(importErrorMessage(err)),
      },
    );
  };

  const runImport = () => {
    if (!preview) return;
    if (selected.size === 0) return setError({ message: 'Select at least one video to import.', retry: false });
    if (!dest) return setDestError('Choose where this playlist should live.');
    setDestError(null);
    setError(null);
    importMut.mutate(
      { url: url.trim(), subjectId: dest.subjectId, folderId: dest.folderId, selectedVideoIds: [...selected] },
      {
        onSuccess: (r) => {
          const parts = [`${plural(r.createdVideos, 'new video')}`];
          if (r.reusedVideos) parts.push(`${plural(r.reusedVideos, 'already in your library', 'already in your library')} (progress kept)`);
          if (r.skippedVideos) parts.push(`${r.skippedVideos} left out`);
          toast.success(`Imported “${r.playlist.title}” — ${parts.join(', ')}.`);
          onClose();
          nav(`/playlists/${r.playlist.id}`);
        },
        onError: (err) => setError(importErrorMessage(err)),
      },
    );
  };

  return (
    <Dialog
      size="lg"
      title="Import a YouTube playlist"
      description="Paste a public or unlisted playlist link. You'll see exactly what will be imported before anything is saved."
      onClose={onClose}
      busy={importMut.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={importMut.isPending}>
            Cancel
          </Button>
          {preview && (
            <Button variant="primary" onClick={runImport} loading={importMut.isPending} disabled={unconfigured || selected.size === 0}>
              {importLabel(selected.size, preview.videoCount)}
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        {unconfigured && (
          <div className="import-notice" role="status">
            <Info size={18} aria-hidden />
            <div className="stack">
              <span>Playlist import needs a YouTube API key on the server (<code>YOUTUBE_API_KEY</code>), and it isn't configured here. Everything else works — you can still add videos one by one.</span>
              <div>
                <Button size="sm" onClick={() => (onClose(), dialogs.open({ kind: 'video', destination }))}>
                  Add a single video instead
                </Button>
              </div>
            </div>
          </div>
        )}
        <form className="import-url" onSubmit={runPreview}>
          <TextField
            label="Playlist link"
            placeholder="https://www.youtube.com/playlist?list=…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setFieldError(null);
            }}
            error={fieldError}
            disabled={importMut.isPending}
            autoFocus
            inputMode="url"
            autoComplete="off"
          />
          <Button type="submit" variant={preview ? 'secondary' : 'primary'} loading={previewMut.isPending} disabled={!url.trim() || unconfigured || importMut.isPending}>
            {preview ? 'Preview again' : 'Preview'}
          </Button>
        </form>

        {error && (
          <div className="import-notice error" role="alert">
            <AlertTriangle size={18} aria-hidden />
            <div className="stack">
              <span>{error.message}</span>
              {error.retry && (
                <div>
                  <Button size="sm" onClick={preview ? runImport : () => runPreview()} disabled={busy}>
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {preview && (
          <>
            <div className="preview-head">
              <Thumb src={preview.playlist.thumbnailUrl} alt="" />
              <div className="stack" style={{ gap: 6 }}>
                <h3>{preview.playlist.title}</h3>
                <p className="muted">
                  {preview.playlist.channelTitle ?? 'Unknown channel'} · {plural(preview.videoCount, 'video')}
                </p>
              </div>
            </div>
            {preview.alreadyImportedPlaylistId && (
              <div className="import-notice info" role="status">
                <Info size={18} aria-hidden />
                <span>You've imported this playlist before. Importing again will merge it: existing progress, notes and favourites are kept and nothing is duplicated.</span>
              </div>
            )}
            {preview.unavailableCount > 0 && (
              <div className="import-notice" role="status">
                <AlertTriangle size={18} aria-hidden />
                <span>
                  {plural(preview.unavailableCount, 'video')} {preview.unavailableCount === 1 ? 'is' : 'are'} private, deleted or unavailable. {preview.unavailableCount === 1 ? 'It' : 'They'} will still be listed, marked as unavailable, in case they return.
                </span>
              </div>
            )}
            {preview.truncated && (
              <div className="import-notice" role="status">
                <AlertTriangle size={18} aria-hidden />
                <span>This playlist is very long. Only the first {preview.videoCount} videos will be imported.</span>
              </div>
            )}
            <div className="preview-toolbar">
              <span role="status" aria-live="polite">
                <strong>{selected.size}</strong> of {preview.videoCount} selected
              </span>
              <span className="row">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(preview.videos.map((v) => v.youtubeVideoId)))} disabled={allSelected(selected, preview.videoCount)}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
                  Select none
                </Button>
              </span>
            </div>
            {preview.excludedVideoIds.length > 0 && (
              <div className="import-notice info" role="status">
                <Info size={18} aria-hidden />
                <span>{plural(preview.excludedVideoIds.length, 'video')} you removed from this playlist before {preview.excludedVideoIds.length === 1 ? 'is' : 'are'} left unchecked. Tick {preview.excludedVideoIds.length === 1 ? 'it' : 'them'} to bring {preview.excludedVideoIds.length === 1 ? 'it' : 'them'} back.</span>
              </div>
            )}
            {preview.duplicateVideoIds.length > 0 && (
              <div className="import-notice info" role="status">
                <Info size={18} aria-hidden />
                <span>
                  {plural(preview.duplicateVideoIds.length, 'video')} {preview.duplicateVideoIds.length === 1 ? 'is' : 'are'} already somewhere else in your library, so {preview.duplicateVideoIds.length === 1 ? 'it is' : 'they are'} left unchecked to avoid duplicates
                  {preview.alreadyImportedPlaylistId ? ' (and will be taken out of this playlist)' : ''}. Tick {preview.duplicateVideoIds.length === 1 ? 'it' : 'them'} to keep {preview.duplicateVideoIds.length === 1 ? 'it' : 'them'} here too.
                </span>
              </div>
            )}
            <ol className="preview-list" aria-label="Videos in this playlist. Untick any you do not want." tabIndex={0}>
              {preview.videos.map((v, i) => {
                const on = selected.has(v.youtubeVideoId);
                const dup = duplicateIds.has(v.youtubeVideoId);
                return (
                  <li key={v.youtubeVideoId} className={on ? '' : 'is-off'}>
                    <input
                      type="checkbox"
                      className="preview-check"
                      checked={on}
                      aria-label={`Include ${v.title}`}
                      onChange={() => {}}
                      onClick={(e) => {
                        const ids = preview.videos.map((x) => x.youtubeVideoId);
                        if (e.shiftKey && lastClicked.current !== null) setSelected((s) => setRange(s, ids, lastClicked.current!, i, !on));
                        else setSelected((s) => toggleId(s, v.youtubeVideoId));
                        lastClicked.current = i;
                      }}
                    />
                    <span className="preview-num">{v.position + 1}</span>
                    <Thumb src={v.thumbnailUrl} />
                    <span className="truncate" title={v.title}>
                      {dup && <span className="tag preview-dup">In library</span>}
                      {v.title}
                    </span>
                    <span className="muted">{v.availability === 'AVAILABLE' ? formatDuration(v.durationSeconds) : 'Unavailable'}</span>
                  </li>
                );
              })}
            </ol>
            <p className="muted small">Tip: hold Shift while clicking to select a range. Videos you leave out are remembered, so a later sync will not add them back.</p>
            <div>
              <h3 style={{ marginBottom: 10 }}>
                <ListVideo size={16} aria-hidden style={{ verticalAlign: '-2px' }} /> Where should it go?
              </h3>
              <DestinationPicker value={dest} onChange={(d) => (setDest(d), setDestError(null))} error={destError} />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
