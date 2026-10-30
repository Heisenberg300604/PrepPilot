import { addDays, parseKey, todayKey } from '@/lib/format';
import type { StudyTask } from '@/lib/types';

/**
 * Planner dates are calendar dates (YYYY-MM-DD) in the student's LOCAL time zone, produced by
 * lib/format `toDateKey`. They are sent to the API as plain dates, never as instants, so a task
 * planned for "tomorrow" stays on that calendar day wherever the server runs.
 */
export const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Valid, real calendar date (rejects 2027-02-30 and malformed input). */
export function isValidDateKey(key: string | null | undefined): key is string {
  if (!key || !DATE_KEY_RE.test(key)) return false;
  const d = parseKey(key);
  return !Number.isNaN(d.getTime()) && addDays(key, 0) === key;
}

/** Selected day from the URL, falling back to today when absent/invalid. */
export const resolveSelectedDay = (param: string | null | undefined, today = todayKey()) => (isValidDateKey(param) ? param : today);

/** Seven consecutive day keys centred on `selected` (3 before, 3 after). */
export const weekAround = (selected: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(selected, i - 3));

export interface DaySummary {
  planned: number;
  completed: number;
  plannedMinutes: number;
  completedMinutes: number;
  /** 0–100 integer share of the daily target covered by completed estimates; 0 when the target is 0. */
  targetPercent: number;
}

export function summarizeDay(tasks: Pick<StudyTask, 'status' | 'estimatedDurationMinutes'>[], targetMinutes: number): DaySummary {
  const done = tasks.filter((t) => t.status === 'DONE');
  const plannedMinutes = tasks.reduce((n, t) => n + t.estimatedDurationMinutes, 0);
  const completedMinutes = done.reduce((n, t) => n + t.estimatedDurationMinutes, 0);
  const targetPercent = targetMinutes > 0 ? Math.min(100, Math.round((completedMinutes / targetMinutes) * 100)) : 0;
  return { planned: tasks.length, completed: done.length, plannedMinutes, completedMinutes, targetPercent };
}

/** Group tasks by scheduledDate, keeping the dates in ascending order. */
export function groupByDate<T extends { scheduledDate: string }>(tasks: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const t of tasks) map.set(t.scheduledDate, [...(map.get(t.scheduledDate) ?? []), t]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function countByDate(tasks: Pick<StudyTask, 'scheduledDate'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) out[t.scheduledDate] = (out[t.scheduledDate] ?? 0) + 1;
  return out;
}

/** Parse the estimated-minutes input; returns null when it is not a whole number in 0–1440. */
export function parseMinutes(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= 0 && n <= 1440 ? n : null;
}
