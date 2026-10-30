import { AlertTriangle, Info, ListVideo } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, TextField, Thumb } from '@/components/ui';
import { DestinationPicker } from '@/features/common/DestinationPicker';
import { useDialogs } from '@/lib/dialogs';
import { formatDuration, plural } from '@/lib/format';
import { useMeta } from '@/lib/hooks';
import { toast } from '@/lib/toast';
import type { Destination, PlaylistPreview } from '@/lib/types';
import { parsePlaylistUrl } from '@/features/videos/youtubeUrl';
import { importErrorMessage } from './helpers';
import { useImportPlaylist, usePreviewPlaylist } from './queries';
import './playlists.css';

export default function ImportPlaylistDialog({ destination = null, onClose }: { destination?: Destination | null; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<PlaylistPreview | null>(null);
  const [dest, setDest] = useState<Destination | null>(destination);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
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
    previewMut.mutate({ url: url.trim() }, { onSuccess: setPreview, onError: (err) => setError(importErrorMessage(err)) });
  };

  const runImport = () => {
    if (!preview) return;
    if (!dest) return setDestError('Choose where this playlist should live.');
    setDestError(null);
    setError(null);
    importMut.mutate(
      { url: url.trim(), subjectId: dest.subjectId, folderId: dest.folderId },
      {
        onSuccess: (r) => {
          const parts = [`${plural(r.createdVideos, 'new video')}`];
          if (r.reusedVideos) parts.push(`${plural(r.reusedVideos, 'already in your library', 'already in your library')} (progress kept)`);
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
            <Button variant="primary" onClick={runImport} loading={importMut.isPending} disabled={unconfigured}>
              Import {plural(preview.videoCount, 'video')}
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
            <ol className="preview-list" aria-label="Videos in this playlist" tabIndex={0}>
              {preview.videos.map((v) => (
                <li key={v.youtubeVideoId}>
                  <span className="preview-num">{v.position + 1}</span>
                  <Thumb src={v.thumbnailUrl} />
                  <span className="truncate" title={v.title}>
                    {v.title}
                  </span>
                  <span className="muted">{v.availability === 'AVAILABLE' ? formatDuration(v.durationSeconds) : 'Unavailable'}</span>
                </li>
              ))}
            </ol>
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
