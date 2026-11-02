import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { badRequest } from '../errors.js';
import { dateString, idParam, ok, optionalText, requiredText } from '../http.js';
import { formatDateOnly, parseDateOnly } from '../lib/dates.js';
import { own } from '../services/ownership.js';
import { recordActivity } from '../services/activity.js';

const MAX_PER_EXAM = 500;

/** Only http(s): these URLs are rendered as hrefs, so `javascript:` and friends must never get in. */
const urlString = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(2048)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
    } catch {
      return false;
    }
  }, 'Enter a full http(s) link');

const round2 = (n: number) => Math.round(n * 100) / 100;
const score = z.number().finite().min(-100_000).max(100_000).transform(round2);
const count = z.number().int().min(0).max(10_000).nullable().optional();
const categoryEnum = z.enum(['OFFICIAL', 'SYLLABUS', 'PYQ', 'NOTES', 'OTHER']);
const testTypeEnum = z.enum(['FULL', 'SECTIONAL', 'PYQ']);

const linkBody = z.object({ title: requiredText(200), url: urlString, category: categoryEnum.default('OTHER'), pinned: z.boolean().default(false) });
const testBody = z.object({
  title: requiredText(200),
  url: urlString,
  testType: testTypeEnum.default('FULL'),
  maxScore: z.number().finite().positive().max(100_000).transform(round2),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  marksCorrect: z.number().finite().positive().max(1000).nullable().optional(),
  /** Marks per wrong answer as a non-positive number, e.g. -1 or -0.25. */
  marksWrong: z.number().finite().min(-1000).max(0).nullable().optional(),
});
const attemptBody = z.object({
  score,
  maxScore: z.number().finite().positive().max(100_000).transform(round2).optional(),
  correct: count,
  wrong: count,
  skipped: count,
  timeMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  reflection: optionalText(2000),
  attemptedOn: dateString,
});

export const serializeLink = (l: any) => ({ id: l.id, examId: l.examId, title: l.title, url: l.url, category: l.category, pinned: l.pinned, displayOrder: l.displayOrder, createdAt: l.createdAt });

export const serializeAttempt = (a: any) => ({
  id: a.id,
  mockTestId: a.mockTestId,
  score: a.score,
  maxScore: a.maxScore,
  correct: a.correct,
  wrong: a.wrong,
  skipped: a.skipped,
  timeMinutes: a.timeMinutes,
  reflection: a.reflection,
  attemptedOn: formatDateOnly(a.attemptedOn),
  createdAt: a.createdAt,
});

export const serializeMockTest = (t: any) => ({
  id: t.id,
  examId: t.examId,
  title: t.title,
  url: t.url,
  testType: t.testType,
  maxScore: t.maxScore,
  durationMinutes: t.durationMinutes,
  marksCorrect: t.marksCorrect,
  marksWrong: t.marksWrong,
  displayOrder: t.displayOrder,
  createdAt: t.createdAt,
  attempts: (t.attempts ?? []).map(serializeAttempt),
});

/** Oldest first, so "last attempt" is simply the final element. */
const attemptsInclude = { attempts: { orderBy: [{ attemptedOn: 'asc' as const }, { createdAt: 'asc' as const }] } };

export function resourcesRouter(db: Db) {
  const r = Router();

  r.get('/exams/:id/resources', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    await own.exam(db, userId, id);
    const [links, tests] = await Promise.all([
      db.examLink.findMany({ where: { userId, examId: id }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] }),
      db.mockTest.findMany({ where: { userId, examId: id }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], include: attemptsInclude }),
    ]);
    ok(res, { links: links.map(serializeLink), tests: tests.map(serializeMockTest) });
  });

  /** Bulk add (the "paste a whole test series" flow). All-or-nothing. */
  r.post('/exams/:id/resources', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ links: z.array(linkBody).max(50).default([]), tests: z.array(testBody).max(50).default([]) })
      .refine((b) => b.links.length + b.tests.length > 0, 'Add at least one link or test')
      .parse(req.body);
    const userId = req.user.id;
    await own.exam(db, userId, id);
    const created = await db.$transaction(async (tx) => {
      // Sequential on purpose: an interactive transaction is a single connection.
      const linkAgg = await tx.examLink.aggregate({ where: { userId, examId: id }, _max: { displayOrder: true }, _count: true });
      const testAgg = await tx.mockTest.aggregate({ where: { userId, examId: id }, _max: { displayOrder: true }, _count: true });
      if (linkAgg._count + body.links.length > MAX_PER_EXAM || testAgg._count + body.tests.length > MAX_PER_EXAM) throw badRequest(`An exam can hold up to ${MAX_PER_EXAM} links and ${MAX_PER_EXAM} mock tests.`);
      const linkBase = (linkAgg._max.displayOrder ?? -1) + 1;
      const testBase = (testAgg._max.displayOrder ?? -1) + 1;
      const links = [];
      for (const [i, l] of body.links.entries()) links.push(await tx.examLink.create({ data: { ...l, userId, examId: id, displayOrder: linkBase + i } }));
      const tests = [];
      for (const [i, t] of body.tests.entries())
        tests.push(
          await tx.mockTest.create({
            data: { ...t, durationMinutes: t.durationMinutes ?? null, marksCorrect: t.marksCorrect ?? null, marksWrong: t.marksWrong ?? null, userId, examId: id, displayOrder: testBase + i },
            include: attemptsInclude,
          }),
        );
      return { links, tests };
    });
    ok(res, { links: created.links.map(serializeLink), tests: created.tests.map(serializeMockTest) }, 201);
  });

  r.patch('/links/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ title: requiredText(200), url: urlString, category: categoryEnum, pinned: z.boolean() }).partial().parse(req.body);
    await own.examLink(db, req.user.id, id);
    ok(res, serializeLink(await db.examLink.update({ where: { id }, data: body })));
  });

  r.delete('/links/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.examLink(db, req.user.id, id);
    await db.examLink.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  r.patch('/mock-tests/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = testBody.partial().parse(req.body);
    await own.mockTest(db, req.user.id, id);
    ok(res, serializeMockTest(await db.mockTest.update({ where: { id }, data: body, include: attemptsInclude })));
  });

  // Attempts cascade with the test.
  r.delete('/mock-tests/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.mockTest(db, req.user.id, id);
    await db.mockTest.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  r.post('/mock-tests/:id/attempts', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = attemptBody.parse(req.body);
    const userId = req.user.id;
    const test = await own.mockTest(db, userId, id);
    const maxScore = body.maxScore ?? test.maxScore;
    if (body.score > maxScore) throw badRequest(`Score can’t be more than ${maxScore}.`);
    const attempt = await db.mockAttempt.create({
      data: {
        userId,
        mockTestId: id,
        score: body.score,
        maxScore,
        correct: body.correct ?? null,
        wrong: body.wrong ?? null,
        skipped: body.skipped ?? null,
        timeMinutes: body.timeMinutes ?? null,
        reflection: body.reflection ?? null,
        attemptedOn: parseDateOnly(body.attemptedOn),
      },
    });
    await recordActivity(db, userId, 'MOCK_ATTEMPTED', { examId: test.examId, metadata: { mockTestId: id, title: test.title, score: body.score, maxScore } });
    ok(res, serializeAttempt(attempt), 201);
  });

  r.delete('/mock-attempts/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.mockAttempt(db, req.user.id, id);
    await db.mockAttempt.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  return r;
}
