import { useState, type FormEvent } from 'react';
import { Button, Dialog, TextArea, TextField } from '@/components/ui';
import { DestinationPicker } from '@/features/common/DestinationPicker';
import { useCreateFolder, useUpdateFolder } from '@/features/subjects/queries';
import { toast } from '@/lib/toast';
import type { Destination, Folder } from '@/lib/types';

interface Props {
  subjectId?: string;
  parentFolderId?: string | null;
  folder?: Folder | null;
  onClose: () => void;
}

export default function FolderDialog({ subjectId, parentFolderId = null, folder, onClose }: Props) {
  const editing = Boolean(folder);
  const needsLocation = !editing && !subjectId;
  const [name, setName] = useState(folder?.name ?? '');
  const [description, setDescription] = useState(folder?.description ?? '');
  const [dest, setDest] = useState<Destination | null>(null);
  const [errors, setErrors] = useState<{ name?: string; dest?: string }>({});
  const create = useCreateFolder();
  const update = useUpdateFolder();
  const busy = create.isPending || update.isPending;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const next: typeof errors = {};
    if (!trimmed) next.name = 'Give the folder a name, e.g. “Main Course”.';
    if (needsLocation && !dest) next.dest = 'Choose an exam and subject for this folder.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      if (folder) await update.mutateAsync({ id: folder.id, name: trimmed, description: description.trim() || null });
      else await create.mutateAsync({ subjectId: needsLocation ? dest!.subjectId : subjectId!, parentFolderId: needsLocation ? dest!.folderId : parentFolderId, name: trimmed, description: description.trim() || null });
      toast.success(editing ? 'Folder renamed' : `Folder “${trimmed}” created`);
      onClose();
    } catch {
      /* toasted by the mutation */
    }
  };

  return (
    <Dialog
      title={editing ? 'Rename folder' : parentFolderId ? 'New sub-folder' : 'New folder'}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="folder-form" loading={busy}>
            {editing ? 'Save' : 'Create folder'}
          </Button>
        </>
      }
    >
      <form id="folder-form" className="form-grid" onSubmit={submit} noValidate>
        {needsLocation && (
          <div>
            <p className="field-hint" style={{ marginBottom: 10 }}>
              Choose where the folder goes. Pick a folder to nest it inside.
            </p>
            <DestinationPicker value={dest} onChange={(d) => (setDest(d), setErrors((x) => ({ ...x, dest: undefined })))} error={errors.dest} />
          </div>
        )}
        <TextField label="Folder name" value={name} onChange={(e) => (setName(e.target.value), setErrors((x) => ({ ...x, name: undefined })))} error={errors.name} autoFocus={!needsLocation} maxLength={120} placeholder="Main Course" required />
        <TextArea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
      </form>
    </Dialog>
  );
}
