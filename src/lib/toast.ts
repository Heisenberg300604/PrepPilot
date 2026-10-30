import { useSyncExternalStore } from 'react';

export type ToastKind = 'success' | 'error' | 'info';
export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; onClick: () => void };
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(kind: ToastKind, message: string, action?: ToastItem['action']) {
  const id = nextId++;
  items = [...items.slice(-3), { id, kind, message, action }];
  emit();
  setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500);
  return id;
}
export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/** Notification API usable from anywhere (components, mutation handlers). */
export const toast = {
  success: (m: string, action?: ToastItem['action']) => push('success', m, action),
  error: (m: string, action?: ToastItem['action']) => push('error', m, action),
  info: (m: string, action?: ToastItem['action']) => push('info', m, action),
};

export const useToasts = () =>
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => items,
  );
