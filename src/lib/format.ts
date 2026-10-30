export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** "1h 20m" / "45m" for planner estimates and totals. */
export function formatMinutes(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export const pad = (n: number) => String(n).padStart(2, '0');

/** The student's local calendar date as YYYY-MM-DD (planner dates are calendar dates, not instants). */
export function toDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayKey = () => toDateKey(new Date());

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + days));
}

/** Parse a YYYY-MM-DD key as a local date. */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(key: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  return key ? parseKey(key).toLocaleDateString(undefined, opts) : '';
}

export function relativeDay(key: string, today = todayKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function daysUntil(key: string, today = todayKey()): number {
  return Math.round((parseKey(key).getTime() - parseKey(today).getTime()) / 86_400_000);
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function statusLabel(s: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED'): string {
  return s === 'COMPLETED' ? 'Completed' : s === 'IN_PROGRESS' ? 'In progress' : 'Not started';
}

export function locationText(l?: { examName: string; subjectName: string; folderPath: string[] } | null): string {
  if (!l) return 'Not filed yet';
  return [l.examName, l.subjectName, ...l.folderPath].join(' › ');
}

export const initials = (name?: string | null) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || 'P';
