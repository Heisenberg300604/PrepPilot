import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError, badRequest, conflict } from '../errors.js';
import { idParam, ok, optionalText, requiredText } from '../http.js';
import { own, resolveDestination } from '../services/ownership.js';
import { buildIndex } from '../services/stats.js';
import { serializeVideo, videoInclude } from '../services/serializers.js';
import { labelLocations, youtubeToAppError } from '../services/library.js';
import { recordActivity } from '../services/activity.js';
import { parseVideoUrl, videoSourceUrl } from '../youtube/parse.js';
import { YouTubeError, type YouTubeApi, type YtVideo } from '../youtube/client.js';

const statusEnum = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']);
const OPEN_ACTIVITY_THROTTLE_MS = 10 * 60_000;

export function videosRouter(db: Db, yt: YouTubeApi) {
  const r = Router();

  /** Library listing: unique videos (never repeated per placement) with optional filters. */
  r.get('/', async (req, res) => {
    const q = z
      .object({
        q: z.string().max(200).optional(),
        status: statusEnum.optional(),
        favorite: z.enum(['true', 'false']).optional(),
        studied: z.enum(['true', 'false']).optional(),
        examId: z.string().optional(),
        subjectId: z.string().optional(),
        folderId: z.string().optional(),
        unfiled: z.enum(['true', 'false']).optional(),
        sort: z.enum(['recent', 'added', 'title', 'duration', 'studied']).default('added'),
        limit: z.coerce.number().int().min(1).max(200).default(60),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    const userId = req.user.id;

    const and: Prisma.VideoWhereInput[] = [];
    if (q.q) {
      const term = { contains: q.q, mode: 'insensitive' as const };
      // also match by hierarchy names (exam / subject / folder / playlist)
      and.push({
        OR: [
          { title: term },
          { channelTitle: term },
          { playlistItems: { some: { playlist: { title: term } } } },
          { placements: { some: { OR: [{ exam: { name: term } }, { subject: { name: term } }, { folder: { name: term } }] } } },
          { playlistItems: { some: { playlist: { placements: { some: { OR: [{ exam: { name: term } }, { subject: { name: term } }, { folder: { name: term } }] } } } } } },
        ],
      });
    }
    if (q.status === 'NOT_STARTED') and.push({ OR: [{ progress: { none: {} } }, { progress: { some: { status: 'NOT_STARTED' } } }] });
    else if (q.status) and.push({ progress: { some: { status: q.status } } });
    if (q.favorite === 'true') and.push({ favorites: { some: {} } });
    if (q.studied === 'true') and.push({ progress: { some: { lastStudiedAt: { not: null } } } });
    if (q.unfiled === 'true') {
      // Not placed anywhere in the hierarchy (directly or through a placed playlist).
      and.push({ placements: { none: {} }, playlistItems: { none: { playlist: { placements: { some: {} } } } } });
    }
    if (q.examId || q.subjectId || q.folderId) {
      const idx = await buildIndex(db, userId);
      const set = q.folderId ? idx.folderVideos.get(q.folderId) : q.subjectId ? idx.subjectVideos.get(q.subjectId) : idx.examVideos.get(q.examId!);
      and.push({ id: { in: [...(set ?? [])] } });
    }

    const where: Prisma.VideoWhereInput = { userId, AND: and };
    const orderBy: Prisma.VideoOrderByWithRelationInput[] =
      q.sort === 'title' ? [{ title: 'asc' }] : q.sort === 'duration' ? [{ durationSeconds: { sort: 'desc', nulls: 'last' } }] : [{ createdAt: 'desc' }];
    const sortByStudied = q.sort === 'studied' || q.sort === 'recent';

    const [total, rows] = await Promise.all([
      db.video.count({ where }),
      db.video.findMany({
        where,
        include: { ...videoInclude, placements: { take: 2 }, playlistItems: { take: 2, include: { playlist: { select: { id: true, title: true, placements: { take: 1 } } } } } },
        orderBy: sortByStudied ? [{ progress: { _count: 'desc' } }, ...orderBy] : orderBy,
        ...(sortByStudied ? {} : { skip: q.offset, take: q.limit }),
      }),
    ]);
    let page = rows;
    if (sortByStudied) {
      page = [...rows]
        .sort((a, b) => (b.progress[0]?.lastStudiedAt?.getTime() ?? 0) - (a.progress[0]?.lastStudiedAt?.getTime() ?? 0))
        .slice(q.offset, q.offset + q.limit);
    }
    const locs = page.map((v) => {
      const p = v.placements[0] ?? v.playlistItems[0]?.playlist.placements[0];
      return p ? { examId: p.examId, subjectId: p.subjectId, folderId: p.folderId } : null;
    });
    const labels = await labelLocations(db, userId, locs.filter((l): l is NonNullable<typeof l> => Boolean(l)));
    ok(res, {
      total,
      items: page.map((v, i) => {
        const l = locs[i];
        const label = l && labels.find((x) => x.subjectId === l.subjectId && x.folderId === l.folderId);
        return serializeVideo(v, { location: label ?? null, playlist: v.playlistItems[0] ? { id: v.playlistItems[0].playlist.id, title: v.playlistItems[0].playlist.title } : null });
      }),
    });
  });

  /** Add one YouTube video (reusing the existing record if the user already has it). */
  r.post('/', async (req, res) => {
    const body = z
      .object({
        url: z.string().min(1).max(2048),
        title: requiredText(300).optional(),
        description: optionalText(5000),
        subjectId: z.string().optional(),
        folderId: z.string().nullable().optional(),
        playlistId: z.string().optional(),
      })
      .parse(req.body);
    const userId = req.user.id;
    const ytId = parseVideoUrl(body.url);
    if (!ytId) throw badRequest('That does not look like a YouTube video link. Try a watch, youtu.be, Shorts, or embed URL.');
    const loc = body.subjectId ? await resolveDestination(db, userId, body.subjectId, body.folderId) : null;
    if (body.folderId && !body.subjectId) throw badRequest('A folder destination needs a subject.');
    const playlist = body.playlistId ? await own.playlist(db, userId, body.playlistId) : null;
    if (playlist?.youtubePlaylistId) throw new AppError(422, 'INVALID_RELATIONSHIP', 'Videos can only be added to local collections. Imported playlists follow their YouTube source.');

    let video = await db.video.findFirst({ where: { userId, youtubeVideoId: ytId } });
    let meta: YtVideo | null = null;
    if (!video) {
      if (yt.configured) {
        try {
          meta = await yt.getVideo(ytId);
        } catch (e) {
          if (!(e instanceof YouTubeError) || e.code === 'NOT_CONFIGURED') throw youtubeToAppError(e);
          if (!body.title) throw new AppError(422, 'METADATA_UNAVAILABLE', `${e.message} Enter a title to add the video manually.`);
        }
        if (!meta && !body.title) throw new AppError(422, 'METADATA_UNAVAILABLE', 'YouTube has no public details for that video. Enter a title to add it manually.');
      }
      if (!meta && !body.title) throw new AppError(422, 'METADATA_UNAVAILABLE', 'YouTube lookup is not configured, so please enter a title for this video.');
      video = await db.video.create({
        data: {
          userId,
          youtubeVideoId: ytId,
          title: body.title ?? meta!.title,
          description: body.description ?? meta?.description ?? null,
          thumbnailUrl: meta?.thumbnailUrl ?? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
          channelTitle: meta?.channelTitle ?? null,
          durationSeconds: meta?.durationSeconds ?? null,
          availabilityStatus: meta?.availability ?? 'UNKNOWN',
          sourceUrl: videoSourceUrl(ytId),
          isCustomized: Boolean(body.title && meta && body.title !== meta.title),
        },
      });
    }
    const created = await db.$transaction(async (tx) => {
      if (loc) {
        const exists = await tx.videoPlacement.findFirst({ where: { userId, videoId: video!.id, subjectId: loc.subjectId, folderId: loc.folderId } });
        if (!exists) await tx.videoPlacement.create({ data: { userId, videoId: video!.id, ...loc } });
      }
      if (playlist) {
        const max = await tx.playlistVideo.aggregate({ where: { playlistId: playlist.id }, _max: { position: true } });
        await tx.playlistVideo.upsert({
          where: { playlistId_videoId: { playlistId: playlist.id, videoId: video!.id } },
          create: { playlistId: playlist.id, videoId: video!.id, position: (max._max.position ?? -1) + 1 },
          update: {},
        });
      }
      return true;
    });
    void created;
    const full = await db.video.findFirstOrThrow({ where: { id: video.id }, include: videoInclude });
    ok(res, serializeVideo(full, { metadataSource: meta ? 'youtube' : 'manual' }), 201);
  });

  r.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { playlistId } = z.object({ playlistId: z.string().optional() }).parse(req.query);
    const userId = req.user.id;
    await own.video(db, userId, id);
    const video = await db.video.findFirstOrThrow({
      where: { id, userId },
      include: {
        ...videoInclude,
        notes: true,
        placements: { orderBy: { createdAt: 'asc' } },
        playlistItems: { include: { playlist: { include: { placements: { orderBy: { createdAt: 'asc' } } } } } },
      },
    });
    const placementLocs = video.placements.map((p) => ({ examId: p.examId, subjectId: p.subjectId, folderId: p.folderId }));
    const viaPlaylist = video.playlistItems.flatMap((it) => it.playlist.placements.map((p) => ({ examId: p.examId, subjectId: p.subjectId, folderId: p.folderId })));
    const labels = await labelLocations(db, userId, [...placementLocs, ...viaPlaylist]);
    const labelOf = (l: { subjectId: string; folderId: string | null }) => labels.find((x) => x.subjectId === l.subjectId && x.folderId === l.folderId) ?? null;

    // Prev / next within the requested playlist context (original order), skipping vanished items.
    let context: any = null;
    const ctxItem = playlistId ? video.playlistItems.find((i) => i.playlistId === playlistId) : undefined;
    if (ctxItem) {
      const siblings = await db.playlistVideo.findMany({ where: { playlistId: ctxItem.playlistId, removedFromSource: false }, orderBy: { position: 'asc' }, include: { video: { include: videoInclude } } });
      const at = siblings.findIndex((s) => s.videoId === id);
      const brief = (s?: (typeof siblings)[number]) => (s ? { id: s.video.id, title: s.video.title, thumbnailUrl: s.video.thumbnailUrl } : null);
      const pl = ctxItem.playlist;
      context = {
        playlist: { id: pl.id, title: pl.title },
        index: at,
        total: siblings.length,
        previous: at > 0 ? brief(siblings[at - 1]) : null,
        next: at >= 0 && at < siblings.length - 1 ? brief(siblings[at + 1]) : null,
        location: pl.placements[0] ? labelOf(pl.placements[0]) : null,
      };
    }
    ok(res, {
      ...serializeVideo(video),
      note: video.notes[0]?.content ?? '',
      noteUpdatedAt: video.notes[0]?.updatedAt ?? null,
      placements: video.placements.map((p) => ({ id: p.id, ...labelOf(p) })),
      playlists: video.playlistItems.map((it) => ({ id: it.playlistId, title: it.playlist.title, position: it.position, removedFromSource: it.removedFromSource, location: it.playlist.placements[0] ? labelOf(it.playlist.placements[0]) : null })),
      context,
    });
  });

  // Local edit only; never changes anything on YouTube.
  r.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ title: requiredText(300).optional(), description: optionalText(5000) }).parse(req.body);
    await own.video(db, req.user.id, id);
    const v = await db.video.update({
      where: { id },
      data: { ...(body.title !== undefined && { title: body.title }), ...(body.description !== undefined && { description: body.description }), isCustomized: true },
      include: videoInclude,
    });
    ok(res, serializeVideo(v));
  });

  /**
   * Status and playback position are independent. Position-only updates move NOT_STARTED -> IN_PROGRESS
   * but never change a COMPLETED video's status.
   */
  r.put('/:id/progress', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ status: statusEnum.optional(), lastPositionSeconds: z.number().int().min(0).max(86400 * 2).optional() }).refine((b) => b.status !== undefined || b.lastPositionSeconds !== undefined, 'Provide status or lastPositionSeconds').parse(req.body);
    const userId = req.user.id;
    const video = await own.video(db, userId, id);
    const now = new Date();
    const current = await db.videoProgress.findUnique({ where: { userId_videoId: { userId, videoId: id } } });
    let status = body.status ?? current?.status ?? 'NOT_STARTED';
    let position = body.lastPositionSeconds ?? current?.lastPositionSeconds ?? 0;
    if (video.durationSeconds != null) position = Math.min(position, video.durationSeconds);
    if (body.status === undefined && status === 'NOT_STARTED' && position > 0) status = 'IN_PROGRESS';
    const completedAt = status === 'COMPLETED' ? (current?.status === 'COMPLETED' ? current.completedAt ?? now : now) : null;
    const justCompleted = status === 'COMPLETED' && current?.status !== 'COMPLETED';
    const data = { status, lastPositionSeconds: position, completedAt, ...(status !== 'NOT_STARTED' || body.lastPositionSeconds ? { lastStudiedAt: now } : {}) };
    const progress = await db.$transaction(async (tx) => {
      const p = await tx.videoProgress.upsert({ where: { userId_videoId: { userId, videoId: id } }, create: { userId, videoId: id, ...data }, update: data });
      if (justCompleted) await recordActivity(tx, userId, 'VIDEO_COMPLETED', { videoId: id });
      return p;
    });
    ok(res, { status: progress.status, lastPositionSeconds: progress.lastPositionSeconds, lastStudiedAt: progress.lastStudiedAt, completedAt: progress.completedAt });
  });

  /** Called when the study view opens: marks the video as being studied and logs (throttled) activity. */
  r.post('/:id/open', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    await own.video(db, userId, id);
    const now = new Date();
    const current = await db.videoProgress.findUnique({ where: { userId_videoId: { userId, videoId: id } } });
    await db.videoProgress.upsert({
      where: { userId_videoId: { userId, videoId: id } },
      create: { userId, videoId: id, status: 'IN_PROGRESS', lastStudiedAt: now },
      update: { lastStudiedAt: now, ...(current?.status === 'NOT_STARTED' ? { status: 'IN_PROGRESS' as const } : {}) },
    });
    const recent = await db.studyActivity.findFirst({ where: { userId, videoId: id, activityType: 'VIDEO_OPENED', createdAt: { gt: new Date(now.getTime() - OPEN_ACTIVITY_THROTTLE_MS) } } });
    if (!recent) await recordActivity(db, userId, 'VIDEO_OPENED', { videoId: id });
    ok(res, { ok: true });
  });

  r.put('/:id/note', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { content } = z.object({ content: z.string().max(50_000) }).parse(req.body);
    const userId = req.user.id;
    await own.video(db, userId, id);
    const n = await db.videoNote.upsert({ where: { userId_videoId: { userId, videoId: id } }, create: { userId, videoId: id, content }, update: { content } });
    ok(res, { content: n.content, updatedAt: n.updatedAt });
  });

  r.put('/:id/favorite', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
    const userId = req.user.id;
    await own.video(db, userId, id);
    if (favorite) await db.favorite.upsert({ where: { userId_videoId: { userId, videoId: id } }, create: { userId, videoId: id }, update: {} });
    else await db.favorite.deleteMany({ where: { userId, videoId: id } });
    ok(res, { favorite });
  });

  // Deleting a video removes its progress, notes and favorite too. If anything depends on it the caller
  // must confirm with ?force=true; the 409 body says what would be lost.
  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { force } = z.object({ force: z.enum(['true', 'false']).optional() }).parse(req.query);
    const userId = req.user.id;
    await own.video(db, userId, id);
    const [placements, playlists, progress, note, favorite] = await Promise.all([
      db.videoPlacement.count({ where: { videoId: id } }),
      db.playlistVideo.count({ where: { videoId: id } }),
      db.videoProgress.count({ where: { videoId: id, status: { not: 'NOT_STARTED' } } }),
      db.videoNote.count({ where: { videoId: id, content: { not: '' } } }),
      db.favorite.count({ where: { videoId: id } }),
    ]);
    const impact = { placements, playlists, hasProgress: progress > 0, hasNote: note > 0, favorite: favorite > 0 };
    if (force !== 'true' && (placements || playlists || progress || note || favorite)) {
      throw Object.assign(conflict('This video is still in use. Confirm to delete it everywhere.'), { details: impact });
    }
    await db.video.delete({ where: { id } });
    ok(res, { deleted: true, impact });
  });

  return r;
}
