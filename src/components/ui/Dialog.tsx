import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './Button';

interface DialogProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** While true the dialog cannot be dismissed (e.g. a save is in flight). */
  busy?: boolean;
}

/** Accessible modal built on the native <dialog>: focus trap, Esc to close, focus returns to the opener. */
export function Dialog({ open = true, onClose, title, description, children, footer, size = 'md', busy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="dialog-panel">
        <header className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descId} className="dialog-desc">
                {description}
              </p>
            )}
          </div>
          <IconButton label="Close dialog" onClick={onClose} disabled={busy}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

interface ConfirmProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
}

/** Confirmation for destructive/shared-data actions: say what will (and will not) happen. */
export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const run = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      setBusy(false); // error toast is shown by the mutation; keep the dialog open for retry
    }
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={run as any} autoFocus={!danger}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm-body">{children}</div>
    </Dialog>
  );
}
