import type { Response } from 'express';
import { z } from 'zod';

export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ data });
export const idParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id') });

export const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
export const requiredText = (max: number) => z.string().trim().min(1, 'Required').max(max);
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const colorString = z.string().trim().max(32).nullable().optional();
