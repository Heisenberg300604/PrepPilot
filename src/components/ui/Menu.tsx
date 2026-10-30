import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separated?: boolean;
}

interface MenuProps {
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  className?: string;
  triggerClassName?: string;
}

/** Dropdown action menu: opens on click, arrow-key navigation, Esc / outside click to close. */
export function Menu({ label, trigger, items, align = 'end', className = '', triggerClassName = 'icon-btn' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = 220;
    const left = align === 'end' ? Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) : Math.max(8, Math.min(window.innerWidth - width - 8, r.left));
    const below = r.bottom + 6;
    const estimatedHeight = items.length * 38 + 12;
    setPos({ left, top: below + estimatedHeight > window.innerHeight ? Math.max(8, r.top - estimatedHeight - 6) : below });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
    const away = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, pos]);

  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') (els[(i + 1) % els.length] ?? els[0])?.focus();
    else if (e.key === 'ArrowUp') (els[(i - 1 + els.length) % els.length] ?? els[0])?.focus();
    else if (e.key === 'Home') els[0]?.focus();
    else if (e.key === 'End') els[els.length - 1]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') btn.current?.focus();
    } else return;
    if (e.key !== 'Tab') e.preventDefault();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`${triggerClassName} ${className}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div id={id} ref={list} role="menu" aria-label={label} className="menu" style={{ top: pos?.top ?? -999, left: pos?.left ?? -999 }} onKeyDown={onKey} onClick={(e) => e.stopPropagation()}>
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                className={`menu-item ${it.danger ? 'danger' : ''} ${it.separated ? 'separated' : ''}`}
                onClick={() => {
                  setOpen(false);
                  btn.current?.focus();
                  it.onSelect();
                }}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
