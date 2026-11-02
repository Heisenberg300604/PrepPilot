import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { badRequest } from '../errors.js';
import { colorString, dateString, idParam, ok, optionalText, requiredText } from '../http.js';
import { parseDateOnly, formatDateOnly } from '../lib/dates.js';
import { own } from '../services/ownership.js';
import { buildIndex, EMPTY, type LibraryIndex } from '../services/stats.js';
import { recordActivity } from '../services/activity.js';
import { serializeSubject } from './subjects.js';

const statusEnum = z.enum(['ACTIVE', 'COMPLETED', 'ARCHIVED']);
const examBody = z.object({
  name: requiredText(120),
  description: optionalText(1000),
  examDate: dateString.nullable().optional(),
  color: colorString,
  icon: colorString,
});

export function serializeExam(e: any, idx: LibraryIndex, extra: Record<string, unknown> = {}) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    examDate: formatDateOnly(e.examDate),
    status: e.status,
    color: e.color,
    icon: e.icon,
    displayOrder: e.displayOrder,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    subjectCount: e._count?.subjects ?? 0,
    stats: idx.stats(idx.examVideos.get(e.id) ?? EMPTY),
    ...extra,
  };
}

export function examsRouter(db: Db) {
  const r = Router();

  r.get('/', async (req, res) => {
    const { status } = z.object({ status: statusEnum.optional() }).parse(req.query);
    const userId = req.user.id;
    const [exams, idx] = await Promise.all([
      db.exam.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        include: { _count: { select: { subjects: true } } },
      }),
      buildIndex(db, userId),
    ]);
    ok(res, exams.map((e) => serializeExam(e, idx)));
  });

  r.post('/', async (req, res) => {
    const body = examBody.parse(req.body);
    const userId = req.user.id;
    const max = await db.exam.aggregate({ where: { userId }, _max: { displayOrder: true } });
    const exam = await db.exam.create({
      data: {
        userId,
        name: body.name,
        description: body.description ?? null,
        examDate: body.examDate ? parseDateOnly(body.examDate) : null,
        color: body.color ?? null,
        icon: body.icon ?? null,
        displayOrder: (max._max.displayOrder ?? -1) + 1,
      },
      include: { _count: { select: { subjects: true } } },
    });
    await recordActivity(db, userId, 'EXAM_CREATED', { examId: exam.id });
    ok(res, serializeExam(exam, await buildIndex(db, userId)), 201);
  });

  r.post('/reorder', async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(500) }).parse(req.body);
    const userId = req.user.id;
    const owned = await db.exam.count({ where: { userId, id: { in: ids } } });
    if (owned !== new Set(ids).size) throw badRequest('Some exams could not be reordered.');
    await db.$transaction(ids.map((id, i) => db.exam.updateMany({ where: { id, userId }, data: { displayOrder: i } })));
    ok(res, { ok: true });
  });

  r.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    await own.exam(db, userId, id);
    const [exam, idx] = await Promise.all([
      db.exam.findFirstOrThrow({
        where: { id, userId },
        include: { _count: { select: { subjects: true } }, subjects: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { folders: true } } } } },
      }),
      buildIndex(db, userId),
    ]);
    const [playlistPlacements, folders] = await Promise.all([
      db.playlistPlacement.count({ where: { userId, examId: id } }),
      db.folder.count({ where: { userId, subject: { examId: id } } }),
    ]);
    ok(res, {
      ...serializeExam(exam, idx),
      subjects: exam.subjects.map((s) => serializeSubject(s, idx, { examName: exam.name })),
      // What deleting the exam would remove (the videos/playlists themselves are kept).
      impact: { subjects: exam.subjects.length, folders, playlistPlacements, videoPlacements: await db.videoPlacement.count({ where: { userId, examId: id } }) },
    });
  });

  r.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = examBody.partial().extend({ status: statusEnum.optional() }).parse(req.body);
    const userId = req.user.id;
    await own.exam(db, userId, id);
    const exam = await db.exam.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.examDate !== undefined && { examDate: body.examDate ? parseDateOnly(body.examDate) : null }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.icon !== undefined && { icon: body.icon }),
        ...(body.status !== undefined && { status: body.status }),
      },
      include: { _count: { select: { subjects: true } } },
    });
    ok(res, serializeExam(exam, await buildIndex(db, userId)));
  });

  // Deleting removes the exam, its subjects, folders and placements. Playlist/video records,
  // progress, notes and favorites are kept, so history survives. Planner tasks are unlinked, not deleted.
  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.exam(db, req.user.id, id);
    await db.exam.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  // Copies the structure (subjects + folder tree) plus quick links and mock tests. Content, progress and mock attempts are not copied.
  r.post('/:id/duplicate', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    const src = await own.exam(db, userId, id);
    const copyId = await db.$transaction(async (tx) => {
      const max = await tx.exam.aggregate({ where: { userId }, _max: { displayOrder: true } });
      const copy = await tx.exam.create({
        data: { userId, name: `${src.name} (copy)`.slice(0, 120), description: src.description, examDate: src.examDate, color: src.color, icon: src.icon, displayOrder: (max._max.displayOrder ?? -1) + 1 },
      });
      const subjects = await tx.subject.findMany({ where: { examId: id, userId }, orderBy: { displayOrder: 'asc' } });
      for (const s of subjects) {
        const ns = await tx.subject.create({ data: { userId, examId: copy.id, name: s.name, description: s.description, color: s.color, icon: s.icon, displayOrder: s.displayOrder, archivedAt: s.archivedAt } });
        const folders = await tx.folder.findMany({ where: { subjectId: s.id, userId } });
        const map = new Map<string, string>();
        let pending = folders;
        while (pending.length) {
          const next: typeof folders = [];
          for (const f of pending) {
            if (f.parentFolderId && !map.has(f.parentFolderId)) {
              next.push(f);
              continue;
            }
            const nf = await tx.folder.create({
              data: { userId, subjectId: ns.id, parentFolderId: f.parentFolderId ? map.get(f.parentFolderId)! : null, name: f.name, description: f.description, displayOrder: f.displayOrder },
            });
            map.set(f.id, nf.id);
          }
          if (next.length === pending.length) break;
          pending = next;
        }
      }
      const links = await tx.examLink.findMany({ where: { examId: id, userId } });
      const tests = await tx.mockTest.findMany({ where: { examId: id, userId } });
      if (links.length) await tx.examLink.createMany({ data: links.map(({ id: _id, createdAt: _c, updatedAt: _u, ...l }) => ({ ...l, examId: copy.id })) });
      if (tests.length) await tx.mockTest.createMany({ data: tests.map(({ id: _id, createdAt: _c, updatedAt: _u, ...t }) => ({ ...t, examId: copy.id })) });
      return copy.id;
    });
    const exam = await db.exam.findFirstOrThrow({ where: { id: copyId, userId }, include: { _count: { select: { subjects: true } } } });
    ok(res, serializeExam(exam, await buildIndex(db, userId)), 201);
  });

  return r;
}
