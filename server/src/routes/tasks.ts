import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { unprocessable } from '../errors.js';
import { dateString, idParam, ok, optionalText, requiredText } from '../http.js';
import { formatDateOnly, parseDateOnly } from '../lib/dates.js';
import { own } from '../services/ownership.js';
import { recordActivity } from '../services/activity.js';

const taskBody = z.object({
  title: requiredText(200),
  description: optionalText(2000),
  scheduledDate: dateString,
  estimatedDurationMinutes: z.number().int().min(0).max(1440),
  examId: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  videoId: z.string().nullable().optional(),
  playlistId: z.string().nullable().optional(),
});

const include = {
  exam: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  video: { select: { id: true, title: true, thumbnailUrl: true } },
  playlist: { select: { id: true, title: true } },
  folder: { select: { id: true, name: true } },
} as const;

type Row = Prisma.StudyTaskGetPayload<{ include: typeof include }>;
export const serializeTask = (t: Row) => ({
  id: t.id,
  title: t.title,
  description: t.description,
  scheduledDate: formatDateOnly(t.scheduledDate)!,
  estimatedDurationMinutes: t.estimatedDurationMinutes,
  status: t.status,
  completedAt: t.completedAt,
  exam: t.exam,
  subject: t.subject,
  folder: t.folder,
  video: t.video,
  playlist: t.playlist,
  createdAt: t.createdAt,
});

/**
 * Validates every linked resource belongs to the user AND that the links agree with each other
 * (subject within exam, folder within subject). Missing parents are derived from the most specific link.
 */
async function resolveLinks(db: Db, userId: string, b: z.infer<typeof taskBody>) {
  let { examId = null, subjectId = null, folderId = null } = b;
  if (folderId) {
    const f = await own.folder(db, userId, folderId);
    if (subjectId && subjectId !== f.subjectId) throw unprocessable('The folder does not belong to the selected subject.');
    subjectId = f.subjectId;
  }
  if (subjectId) {
    const s = await own.subject(db, userId, subjectId);
    if (examId && examId !== s.examId) throw unprocessable('The subject does not belong to the selected exam.');
    examId = s.examId;
  }
  if (examId) await own.exam(db, userId, examId);
  if (b.videoId) await own.video(db, userId, b.videoId);
  if (b.playlistId) await own.playlist(db, userId, b.playlistId);
  return { examId, subjectId, folderId, videoId: b.videoId ?? null, playlistId: b.playlistId ?? null };
}

export function tasksRouter(db: Db) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = z.object({ from: dateString.optional(), to: dateString.optional(), status: z.enum(['TODO', 'DONE']).optional(), overdueBefore: dateString.optional() }).parse(req.query);
    const where: Prisma.StudyTaskWhereInput = { userId: req.user.id };
    if (q.from || q.to) where.scheduledDate = { ...(q.from && { gte: parseDateOnly(q.from) }), ...(q.to && { lte: parseDateOnly(q.to) }) };
    if (q.overdueBefore) {
      where.scheduledDate = { lt: parseDateOnly(q.overdueBefore) };
      where.status = 'TODO';
    }
    if (q.status) where.status = q.status;
    const tasks = await db.studyTask.findMany({ where, include, orderBy: [{ scheduledDate: 'asc' }, { status: 'desc' }, { createdAt: 'asc' }], take: 500 });
    ok(res, tasks.map(serializeTask));
  });

  r.post('/', async (req, res) => {
    const body = taskBody.parse(req.body);
    const userId = req.user.id;
    const links = await resolveLinks(db, userId, body);
    const t = await db.studyTask.create({
      data: { userId, title: body.title, description: body.description ?? null, scheduledDate: parseDateOnly(body.scheduledDate), estimatedDurationMinutes: body.estimatedDurationMinutes, ...links },
      include,
    });
    ok(res, serializeTask(t), 201);
  });

  r.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = taskBody.partial().extend({ status: z.enum(['TODO', 'DONE']).optional() }).parse(req.body);
    const userId = req.user.id;
    const current = await own.task(db, userId, id);
    const touchesLinks = ['examId', 'subjectId', 'folderId', 'videoId', 'playlistId'].some((k) => k in body);
    const links = touchesLinks
      ? await resolveLinks(db, userId, { title: 'x', scheduledDate: '2000-01-01', estimatedDurationMinutes: 0, examId: current.examId, subjectId: current.subjectId, folderId: current.folderId, videoId: current.videoId, playlistId: current.playlistId, ...body })
      : {};
    const completing = body.status === 'DONE' && current.status !== 'DONE';
    const t = await db.$transaction(async (tx) => {
      const u = await tx.studyTask.update({
        where: { id },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.scheduledDate !== undefined && { scheduledDate: parseDateOnly(body.scheduledDate) }),
          ...(body.estimatedDurationMinutes !== undefined && { estimatedDurationMinutes: body.estimatedDurationMinutes }),
          ...(body.status !== undefined && { status: body.status, completedAt: body.status === 'DONE' ? (current.completedAt ?? new Date()) : null }),
          ...links,
        },
        include,
      });
      if (completing) await recordActivity(tx, userId, 'TASK_COMPLETED', { taskId: id, examId: u.examId ?? undefined, subjectId: u.subjectId ?? undefined });
      return u;
    });
    ok(res, serializeTask(t));
  });

  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.task(db, req.user.id, id);
    await db.studyTask.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  return r;
}
