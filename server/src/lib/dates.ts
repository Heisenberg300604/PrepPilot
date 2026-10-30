import { badRequest } from '../errors.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * PrepPilot stores planner dates as calendar dates (Postgres DATE) with no time zone.
 * The browser sends the student's local YYYY-MM-DD; "today" is always supplied by the client.
 */
export function parseDateOnly(s: string): Date {
  if (!DATE_RE.test(s)) throw badRequest(`Invalid date "${s}". Use YYYY-MM-DD.`);
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw badRequest(`Invalid date "${s}".`);
  return d;
}

export const formatDateOnly = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
