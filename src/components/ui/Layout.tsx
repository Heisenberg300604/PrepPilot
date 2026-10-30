import { ChevronRight, PlayCircle } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '@/lib/format';

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p className="page-desc">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {items.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            <li>{c.to && i < items.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>}</li>
            {i < items.length - 1 && <ChevronRight size={14} aria-hidden className="crumb-sep" />}
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}
/** Single-choice filter (e.g. All / Not started / In progress / Completed). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: SegmentOption<T>[]; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={value === o.value ? 'selected' : ''} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="seg-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Video / playlist thumbnail with a graceful fallback when no image is available. */
export function Thumb({ src, alt = '', duration, className = '' }: { src?: string | null; alt?: string; duration?: number | null; className?: string }) {
  return (
    <div className={`thumb ${className}`}>
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <PlayCircle size={26} aria-hidden className="thumb-fallback" />}
      {duration != null && <span className="thumb-duration">{formatDuration(duration)}</span>}
    </div>
  );
}
