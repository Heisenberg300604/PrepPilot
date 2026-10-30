import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextField } from '@/components/ui';
import { toast } from '@/lib/toast';
import type { Video } from '@/lib/types';
import { useUpdateVideo } from './queries';

export function EditVideoTitleDialog({ video, onClose }: { video: Pick<Video, 'id' | 'title'>; onClose: () => void }) {
  const [title, setTitle] = useState(video.title);
  const update = useUpdateVideo();
  const error = title.trim() ? null : 'Enter a title.';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (error) return;
    update.mutate({ id: video.id, title: title.trim() }, { onSuccess: () => (toast.success('Title updated in PrepPilot'), onClose()) });
  };
  return (
    <Dialog
      title="Edit title"
      description="This only changes the title inside PrepPilot. The video on YouTube is not affected."
      onClose={onClose}
      size="sm"
      busy={update.isPending}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button variant="primary" type="submit" form="edit-video-title" loading={update.isPending}>Save</Button>
        </>
      }
    >
      <form id="edit-video-title" onSubmit={submit}>
        <TextField label="Title" value={title} maxLength={300} autoFocus onChange={(e) => setTitle(e.target.value)} error={title !== video.title ? error : null} />
      </form>
    </Dialog>
  );
}
