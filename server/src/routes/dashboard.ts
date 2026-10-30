import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { dateString, ok } from '../http.js';
import { parseDateOnly } from '../lib/dates.js';
import { buildIndex, EMPTY } from '../services/stats.js';
import { serializeVideo, videoInclude } from '../services/serializers.js';
import { labelLocations } from '../services/library.js';
import { serializeExam } from './exams.js';
import { serializeTask } from './tasks.js';

const taskInclude = {
  exam: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  video: { select: { id: true, title: true, thumbnailUrl: true } },
  playlist: { select: { id: true, title: true } },
  folder: { select: { id: true, name: true } },
} as const;

export function dashboardRouter(db: Db) {
  const r = Router();

  r.get('/dashboard', async (req, res) => {
    const { today } = z.object({ today: dateString }).parse(req.query);
    const userId = req.user.id;
    const day = parseDateOnly(today);
    const [profile, idx, exams, todayTasks, overdue, upcoming, continueRows] = await Promise.all([
      db.userProfile.findUniqueOrThrow({ where: { id: userId } }),
      buildIndex(db, userId),
      db.exam.findMany({ where: { userId, status: 'ACTIVE' }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { subjects: true } } } }),
      db.studyTask.findMany({ where: { userId, scheduledDate: day }, include: taskInclude, orderBy: [{ status: 'desc' }, { createdAt: 'asc' }] }),
      db.studyTask.count({ where: { userId, status: 'TODO', scheduledDate: { lt: day } } }),
      db.studyTask.count({ where: { userId, status: 'TODO', scheduledDate: { gt: day } } }),
      db.video.findMany({
        where: { userId, progress: { some: { status: 'IN_PROGRESS', lastStudiedAt: { not: null } } } },
        include: { ...videoInclude, placements: { take: 1 }, playlistItems: { take: 1, include: { playlist: { select: { id: true, title: true, placements: { take: 1 } } } } } },
      }),
    ]);

    // Every active exam's videos, deduplicated, for the overall figures.
    const active = new Set<string>();
    for (const e of exams) for (const v of idx.examVideos.get(e.id) ?? EMPTY) active.add(v);
    const overall = idx.stats(active);

    const recent = continueRows
      .sort((a, b) => (b.progress[0]?.lastStudiedAt?.getTime() ?? 0) - (a.progress[0]?.lastStudiedAt?.getTime() ?? 0))
      .slice(0, 6);
    const locs = recent.map((v) => v.placements[0] ?? v.playlistItems[0]?.playlist.placements[0]).map((p) => (p ? { examId: p.examId, subjectId: p.subjectId, folderId: p.folderId } : null));
    const labels = await labelLocations(db, userId, locs.filter((l): l is NonNullable<typeof l> => Boolean(l)));

    const plannedMinutes = todayTasks.reduce((n, t) => n + t.estimatedDurationMinutes, 0);
    const doneMinutes = todayTasks.filter((t) => t.status === 'DONE').reduce((n, t) => n + t.estimatedDurationMinutes, 0);
    ok(res, {
      displayName: profile.displayName,
      dailyStudyTargetMinutes: profile.dailyStudyTargetMinutes,
      overview: {
        activeExams: exams.length,
        totalVideos: overall.total,
        completedVideos: overall.completed,
        remainingVideos: overall.remaining,
        percent: overall.percent,
        todayTasks: todayTasks.length,
        todayTasksDone: todayTasks.filter((t) => t.status === 'DONE').length,
      },
      exams: exams.map((e) => serializeExam(e, idx)),
      continueStudying: recent.map((v, i) => {
        const l = locs[i];
        const label = l && labels.find((x) => x.subjectId === l.subjectId && x.folderId === l.folderId);
        return serializeVideo(v, { location: label ?? null, playlist: v.playlistItems[0] ? { id: v.playlistItems[0].playlist.id, title: v.playlistItems[0].playlist.title } : null });
      }),
      today: {
        date: today,
        tasks: todayTasks.map(serializeTask),
        plannedMinutes,
        // "planned" is an estimate, not measured study time.
        completedPlannedMinutes: doneMinutes,
        targetMinutes: profile.dailyStudyTargetMinutes,
        targetPercent: profile.dailyStudyTargetMinutes > 0 ? Math.min(100, Math.round((doneMinutes / profile.dailyStudyTargetMinutes) * 100)) : 0,
        overdueCount: overdue,
        upcomingCount: upcoming,
      },
    });
  });

  r.get('/activity', async (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    const rows = await db.studyActivity.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { video: { select: { id: true, title: true } }, playlist: { select: { id: true, title: true } } },
    });
    ok(res, rows.map((a) => ({ id: a.id, type: a.activityType, createdAt: a.createdAt, video: a.video, playlist: a.playlist, metadata: a.metadata })));
  });

  /** Global search across the user's own exams, subjects, folders, playlists and videos. */
  r.get('/search', async (req, res) => {
    const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(req.query);
    const userId = req.user.id;
    const term = { contains: q, mode: 'insensitive' as const };
    const [exams, subjects, folders, playlists, videos] = await Promise.all([
      db.exam.findMany({ where: { userId, name: term }, take: 5, select: { id: true, name: true, status: true } }),
      db.subject.findMany({ where: { userId, name: term }, take: 5, select: { id: true, name: true, exam: { select: { id: true, name: true } } } }),
      db.folder.findMany({ where: { userId, name: term }, take: 5, select: { id: true, name: true, subjectId: true, subject: { select: { name: true } } } }),
      db.playlist.findMany({ where: { userId, title: term }, take: 5, select: { id: true, title: true, thumbnailUrl: true } }),
      db.video.findMany({ where: { userId, OR: [{ title: term }, { channelTitle: term }] }, take: 8, select: { id: true, title: true, thumbnailUrl: true } }),
    ]);
    ok(res, { exams, subjects, folders, playlists, videos });
  });

  return r;
}
