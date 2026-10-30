import { useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import type { Destination } from '@/lib/types';
import { DestinationPicker } from './DestinationPicker';

interface Props {
  title: string;
  description?: string;
  /** Pre-selected location (usually the current one). */
  initial?: Destination | null;
  /** Folder ids that cannot be chosen (a folder and all its descendants when moving a folder). */
  excludeFolderIds?: Set<string>;
  confirmLabel?: string;
  /** Resolve to close the dialog; throw/reject to keep it open (the mutation toasts the error). */
  onConfirm: (destination: Destination) => Promise<unknown> | unknown;
  onClose: () => void;
}

/** Keyboard-accessible alternative to drag-and-drop: "Move to…" any exam › subject › folder. */
export function MoveDialog({ title, description, initial = null, excludeFolderIds, confirmLabel = 'Move here', onConfirm, onClose }: Props) {
  const [dest, setDest] = useState<Destination | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!dest) return setError('Choose where to move it.');
    setBusy(true);
    try {
      await onConfirm(dest);
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <DestinationPicker value={dest} onChange={(d) => (setDest(d), setError(null))} excludeFolderIds={excludeFolderIds} error={error} />
    </Dialog>
  );
}
