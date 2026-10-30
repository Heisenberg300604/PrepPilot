import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, TextArea, TextField } from '@/components/ui';
import { DestinationPicker } from '@/features/common/DestinationPicker';
import { ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Destination } from '@/lib/types';
import '../playlists/playlists.css';
import { useAddVideo } from './queries';
import { parseVideoUrl } from './youtubeUrl';

export default function AddVideoDialog({ destination = null, playlistId, onClose }: { destination?: Destination | null; playlistId?: string; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [needsTitle, setNeedsTitle] = useState<string | null>(null);
  const [dest, setDest] = useState<Destination | null>(destination);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const add = useAddVideo();
  const nav = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!parseVideoUrl(url)) return setUrlError('That does not look like a YouTube video link. Try a watch, youtu.be, Shorts or embed URL.');
    setUrlError(null);
    if (needsTitle !== null && !title.trim()) return setTitleError('Enter a title for this video.');
    setTitleError(null);
    add.mutate(
      {
        url: url.trim(),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(dest ? { subjectId: dest.subjectId, folderId: dest.folderId } : {}),
        ...(playlistId ? { playlistId } : {}),
      },
      {
        onSuccess: (v) => {
          toast.success(dest || playlistId ? `Added “${v.title}”.` : `Added “${v.title}” to your library.`, { label: 'Open', onClick: () => nav(`/watch/${v.id}${playlistId ? `?playlist=${playlistId}` : ''}`) });
          onClose();
        },
        onError: (err: ApiError) => {
          if (err.code === 'METADATA_UNAVAILABLE') {
            setNeedsTitle(err.message);
            setTitleError(null);
          } else setFormError(err.message);
        },
      },
    );
  };

  return (
    <Dialog
      title="Add a video"
      description="Paste a YouTube video link. PrepPilot keeps the official link and plays it in the embedded YouTube player."
      onClose={onClose}
      busy={add.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={add.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" form="add-video-form" loading={add.isPending}>
            Add video
          </Button>
        </>
      }
    >
      <form id="add-video-form" className="form-grid" onSubmit={submit} noValidate>
        <TextField
          label="YouTube link"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(null);
          }}
          error={urlError}
          autoFocus
          inputMode="url"
          autoComplete="off"
        />
        {needsTitle !== null && (
          <>
            <p className="import-notice" role="status" style={{ display: 'block' }}>
              {needsTitle}
            </p>
            <TextField label="Title" value={title} onChange={(e) => (setTitle(e.target.value), setTitleError(null))} error={titleError} maxLength={300} />
            <TextArea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
          </>
        )}
        {playlistId ? (
          <p className="muted">It will be added to this collection{dest ? ' and filed below' : ''}.</p>
        ) : null}
        <DestinationPicker optional value={dest} onChange={setDest} />
        {formError && (
          <p className="field-error" role="alert">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}
