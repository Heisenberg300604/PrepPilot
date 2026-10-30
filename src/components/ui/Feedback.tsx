import { AlertTriangle, CheckCircle2, Circle, CircleDashed, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { dismiss, useToasts } from '@/lib/toast';
import { statusLabel } from '@/lib/format';
import type { ProgressStatus } from '@/lib/types';
import { Button } from './Button';

export function Progress({ value, label, size = 'md' }: { value: number; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const v = Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
  return (
    <div className={`progress progress-${size}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
      <span style={{ width: `${v}%` }} />
    </div>
  );
}

const STATUS_ICON: Record<ProgressStatus, LucideIcon> = { NOT_STARTED: Circle, IN_PROGRESS: CircleDashed, COMPLETED: CheckCircle2 };
/** Status is conveyed by icon + text, never colour alone. */
export function StatusBadge({ status }: { status: ProgressStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge badge-${status.toLowerCase().replace('_', '-')}`}>
      <Icon size={13} aria-hidden />
      {statusLabel(status)}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={22} aria-hidden />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "We couldn't load this" }: { error: unknown; onRetry?: () => void; title?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className="empty error-state" role="alert">
      <div className="empty-icon danger">
        <AlertTriangle size={22} aria-hidden />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry && (
        <div className="empty-action">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  );
}

export const Skeleton = ({ className = '', style }: { className?: string; style?: React.CSSProperties }) => <div className={`skeleton ${className}`} style={style} aria-hidden />;

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <Loader2 className="spin" size={22} aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function CardSkeletons({ count = 3, height = 150 }: { count?: number; height?: number }) {
  return (
    <div className="card-grid" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} style={{ height }} />
      ))}
    </div>
  );
}

const TOAST_ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };
/** Polite live region; errors are announced assertively. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const Icon = TOAST_ICON[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon size={18} aria-hidden />
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
