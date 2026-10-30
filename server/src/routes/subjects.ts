import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { badRequest } from '../errors.js';
import { colorString, idParam, ok, optionalText, requiredText } from '../http.js';
import { own } from '../services/ownership.js';
import { buildIndex, EMPTY, type LibraryIndex } from '../services/stats.js';

export function serializeSubject(s: any, idx: LibraryIndex, extra: Record<string, unknown> = {}) {
  return {
    id: s.id,
    examId: s.examId,
    name: s.name,
    description: s.description,
    color: s.color,
    icon: s.icon,
    displayOrder: s.displayOrder,
    archived: Boolean(s.archivedAt),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    folderCount: idx.subjectFolderCount.get(s.id) ?? s._count?.folders ?? 0,
    stats: idx.stats(idx.subjectVideos.get(s.id) ?? EMPTY),
    ...extra,
  };
}

const subjectBody = z.object({
  examId: z.string().min(1),
  name: requiredText(120),
  description: optionalText(1000),
  color: colorString,
  icon: colorString,
});

export function subjectsRouter(db: Db) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = z.object({ examId: z.string().optional(), archived: z.enum(['true', 'false']).optional() }).parse(req.query);
    const userId = req.user.id;
    const [subjects, idx] = await Promise.all([
      db.subject.findMany({
        where: { userId, ...(q.examId ? { examId: q.examId } : {}), ...(q.archived ? { archivedAt: q.archived === 'true' ? { not: null } : null } : {}) },
        orderBy: [{ examId: 'asc' }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
        include: { exam: { select: { name: true } } },
      }),
      buildIndex(db, userId),
    ]);
    ok(res, subjects.map((s) => serializeSubject(s, idx, { examName: s.exam.name })));
  });

  r.post('/', async (req, res) => {
    const body = subjectBody.parse(req.body);
    const userId = req.user.id;
    const exam = await own.exam(db, userId, body.examId);
    const max = await db.subject.aggregate({ where: { userId, examId: exam.id }, _max: { displayOrder: true } });
    const subject = await db.subject.create({
      data: { userId, examId: exam.id, name: body.name, description: body.description ?? null, color: body.color ?? null, icon: body.icon ?? null, displayOrder: (max._max.displayOrder ?? -1) + 1 },
    });
    ok(res, serializeSubject(subject, await buildIndex(db, userId), { examName: exam.name }), 201);
  });

  r.post('/reorder', async (req, res) => {
    const { examId, ids } = z.object({ examId: z.string(), ids: z.array(z.string()).min(1).max(500) }).parse(req.body);
    const userId = req.user.id;
    await own.exam(db, userId, examId);
    const owned = await db.subject.count({ where: { userId, examId, id: { in: ids } } });
    if (owned !== new Set(ids).size) throw badRequest('Some subjects could not be reordered.');
    await db.$transaction(ids.map((id, i) => db.subject.updateMany({ where: { id, userId, examId }, data: { displayOrder: i } })));
    ok(res, { ok: true });
  });

  r.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    const subject = await own.subject(db, userId, id);
    const [exam, idx] = await Promise.all([own.exam(db, userId, subject.examId), buildIndex(db, userId)]);
    ok(res, serializeSubject(subject, idx, { examName: exam.name }));
  });

  r.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = subjectBody.partial().extend({ archived: z.boolean().optional() }).parse(req.body);
    const userId = req.user.id;
    const subject = await own.subject(db, userId, id);
    const targetExam = body.examId && body.examId !== subject.examId ? await own.exam(db, userId, body.examId) : null;
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.subject.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.color !== undefined && { color: body.color }),
          ...(body.icon !== undefined && { icon: body.icon }),
          ...(body.archived !== undefined && { archivedAt: body.archived ? new Date() : null }),
          ...(targetExam && { examId: targetExam.id }),
        },
      });
      if (targetExam) {
        // keep denormalised exam references consistent when a subject moves between exams
        await tx.playlistPlacement.updateMany({ where: { subjectId: id, userId }, data: { examId: targetExam.id } });
        await tx.videoPlacement.updateMany({ where: { subjectId: id, userId }, data: { examId: targetExam.id } });
        await tx.studyTask.updateMany({ where: { subjectId: id, userId }, data: { examId: targetExam.id } });
      }
      return u;
    });
    const exam = await own.exam(db, userId, updated.examId);
    ok(res, serializeSubject(updated, await buildIndex(db, userId), { examName: exam.name }));
  });

  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.subject(db, req.user.id, id);
    await db.subject.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  return r;
}
