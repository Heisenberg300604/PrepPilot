import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { AppError, conflict, unprocessable, badRequest } from '../errors.js';
import { idParam, ok, optionalText, requiredText } from '../http.js';
import { own, resolveDestination } from '../services/ownership.js';
import { buildIndex } from '../services/stats.js';
import { serializePlaylist, serializeVideo, videoInclude } from '../services/serializers.js';
import { duplicatesElsewhere, fetchPlaylist, labelLocations, PlaylistCache, removePlaylistItems, syncPlaylistItems, upsertPlaylistRecord, upsertYoutubeVideos } from '../services/library.js';
import { recordActivity } from '../services/activity.js';
import { parsePlaylistUrl } from '../youtube/parse.js';
import type { YouTubeApi } from '../youtube/client.js';

const dest = z.object({ subjectId: z.string(), folderId: z.string().nullable().optional() });

export function playlistsRouter(db: Db, yt: YouTubeApi, expensive: import('express').RequestHandler[] = [], cacheTtlMs = 5 * 60_000) {
  const r = Router();
  const cache = new PlaylistCache(cacheTtlMs);

  const playlistIdFromUrl = (url: string) => {
    const id = parsePlaylistUrl(url);
    if (!id) throw badRequest('That does not look like a YouTube playlist link. Paste a URL containing "list=…" (private lists like Watch later cannot be imported).');
    return id;
  };

  /** Nothing is written here: this only reads from YouTube (cached for a few minutes). */
  r.post('/preview', ...expensive, async (req, res) => {
    const { url } = z.object({ url: z.string().min(1).max(2048) }).parse(req.body);
    const ytId = playlistIdFromUrl(url);
    const c = await fetchPlaylist(yt, cache, ytId);
    if (!c.videos.length) throw new AppError(422, 'EMPTY_PLAYLIST', 'This playlist has no videos to import.');
    const userId = req.user.id;
    const ytIds = c.videos.map((v) => v.youtubeVideoId);
    const [existingPlaylist, existingVideos] = await Promise.all([
      db.playlist.findFirst({ where: { userId, youtubePlaylistId: ytId }, select: { id: true, exclusions: { select: { youtubeVideoId: true } } } }),
      db.video.count({ where: { userId, youtubeVideoId: { in: ytIds } } }),
    ]);
    const duplicates = await duplicatesElsewhere(db, userId, ytIds, existingPlaylist?.id ?? null, { includeMembers: true });
    ok(res, {
      playlist: c.playlist,
      truncated: c.truncated,
      videoCount: c.videos.length,
      unavailableCount: c.videos.filter((v) => v.availability !== 'AVAILABLE').length,
      alreadyImportedPlaylistId: existingPlaylist?.id ?? null,
      alreadyKnownVideoCount: existingVideos,
      /** Videos the user previously removed from this playlist; the UI pre-unchecks them. */
      excludedVideoIds: existingPlaylist?.exclusions.map((e) => e.youtubeVideoId) ?? [],
      /** Videos also elsewhere in the library (placed directly or in another playlist), even if already in this one; the UI pre-unchecks them. */
      duplicateVideoIds: ytIds.filter((v) => duplicates.has(v)),
      videos: c.videos.map((v) => ({ youtubeVideoId: v.youtubeVideoId, title: v.title, thumbnailUrl: v.thumbnailUrl, durationSeconds: v.durationSeconds, availability: v.availability, position: v.position })),
    });
  });

  r.post('/import', ...expensive, async (req, res) => {
    const body = z.object({ url: z.string().min(1).max(2048), selectedVideoIds: z.array(z.string().max(32)).max(1000).optional() }).and(dest).parse(req.body);
    const ytId = playlistIdFromUrl(body.url);
    const userId = req.user.id;
    const loc = await resolveDestination(db, userId, body.subjectId, body.folderId);
    const c = await fetchPlaylist(yt, cache, ytId);
    if (!c.videos.length) throw new AppError(422, 'EMPTY_PLAYLIST', 'This playlist has no videos to import.');
    // No selection = everything. An explicit selection imports only those videos; the rest are remembered as
    // exclusions so later syncs don't add them back. (Selection is matched against what YouTube returned,
    // never trusted as data.)
    const pick = body.selectedVideoIds ? new Set(body.selectedVideoIds) : null;
    const chosen = pick ? c.videos.filter((v) => pick.has(v.youtubeVideoId)) : c.videos;
    if (!chosen.length) throw new AppError(422, 'NOTHING_SELECTED', 'Select at least one video to import.');
    const skipped = c.videos.filter((v) => !chosen.includes(v));
    const result = await db.$transaction(
      async (tx) => {
        const playlist = await upsertPlaylistRecord(tx, userId, c);
        // an explicit choice replaces earlier exclusions for the videos on this page of YouTube results
        await tx.playlistExclusion.deleteMany({ where: { playlistId: playlist.id, youtubeVideoId: { in: chosen.map((v) => v.youtubeVideoId) } } });
        const { map, created } = await upsertYoutubeVideos(tx, userId, chosen);
        const sync = await syncPlaylistItems(tx, playlist.id, chosen, map);
        let removedNow = 0;
        if (skipped.length) {
          // previously imported but now deselected -> remove them (and remember), same as a manual removal
          const known = await tx.video.findMany({ where: { userId, youtubeVideoId: { in: skipped.map((v) => v.youtubeVideoId) } }, select: { id: true } });
          const gone = await removePlaylistItems(tx, userId, playlist, known.map((k) => k.id), true);
          removedNow = gone.removed;
          await tx.playlistExclusion.createMany({
            data: skipped.map((v) => ({ playlistId: playlist.id, youtubeVideoId: v.youtubeVideoId, title: v.title, thumbnailUrl: v.thumbnailUrl })),
            skipDuplicates: true,
          });
        }
        const placed = await tx.playlistPlacement.findFirst({ where: { userId, playlistId: playlist.id, subjectId: loc.subjectId, folderId: loc.folderId } });
        if (!placed) await tx.playlistPlacement.create({ data: { userId, playlistId: playlist.id, ...loc } });
        await recordActivity(tx, userId, 'PLAYLIST_IMPORTED', { playlistId: playlist.id, subjectId: loc.subjectId, examId: loc.examId, folderId: loc.folderId ?? undefined, metadata: { videos: chosen.length, skipped: skipped.length } });
        return { playlist, createdVideos: created, reusedVideos: chosen.length - created, addedItems: sync.added, alreadyPlaced: Boolean(placed), skippedVideos: skipped.length, removedFromPlaylist: removedNow };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    ok(res, { ...result, playlist: serializePlaylist(result.playlist, await buildIndex(db, userId)), truncated: c.truncated }, 201);
  });

  /** Local (manual) collection, not linked to YouTube. */
  r.post('/', async (req, res) => {
    const body = z.object({ title: requiredText(200), description: optionalText(2000) }).and(dest).parse(req.body);
    const userId = req.user.id;
    const loc = await resolveDestination(db, userId, body.subjectId, body.folderId);
    const playlist = await db.$transaction(async (tx) => {
      const p = await tx.playlist.create({ data: { userId, title: body.title, description: body.description ?? null, isCustomized: true } });
      await tx.playlistPlacement.create({ data: { userId, playlistId: p.id, ...loc } });
      return p;
    });
    ok(res, serializePlaylist(playlist, await buildIndex(db, userId)), 201);
  });

  r.get('/', async (req, res) => {
    const { q } = z.object({ q: z.string().max(200).optional() }).parse(req.query);
    const userId = req.user.id;
    const [list, idx] = await Promise.all([
      db.playlist.findMany({ where: { userId, ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { createdAt: 'desc' }, include: { placements: { take: 1 } } }),
      buildIndex(db, userId),
    ]);
    const labels = await labelLocations(db, userId, list.flatMap((p) => p.placements.map((x) => ({ examId: x.examId, subjectId: x.subjectId, folderId: x.folderId }))));
    ok(res, list.map((p) => {
      const first = p.placements[0];
      const label = first && labels.find((l) => l.subjectId === first.subjectId && l.folderId === first.folderId);
      return serializePlaylist(p, idx, { location: label ?? null });
    }));
  });

  r.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    await own.playlist(db, userId, id);
    const [playlist, idx] = await Promise.all([
      db.playlist.findFirstOrThrow({
        where: { id, userId },
        include: {
          placements: { orderBy: { createdAt: 'asc' } },
          items: { orderBy: { position: 'asc' }, include: { video: { include: videoInclude } } },
          exclusions: { orderBy: { createdAt: 'desc' } },
        },
      }),
      buildIndex(db, userId),
    ]);
    const labels = await labelLocations(db, userId, playlist.placements.map((p) => ({ examId: p.examId, subjectId: p.subjectId, folderId: p.folderId })));
    ok(res, {
      ...serializePlaylist(playlist, idx),
      isLocal: !playlist.youtubePlaylistId,
      placements: playlist.placements.map((p, i) => ({ id: p.id, ...labels[i] })),
      videos: playlist.items.map((it) => serializeVideo(it.video, { position: it.position, removedFromSource: it.removedFromSource })),
      /** Videos the user removed from this playlist (sync will not re-add them until restored). */
      excludedVideos: playlist.exclusions.map((e) => ({ youtubeVideoId: e.youtubeVideoId, title: e.title, thumbnailUrl: e.thumbnailUrl, removedAt: e.createdAt })),
    });
  });

  // Edits are LOCAL to PrepPilot — they never change the playlist on YouTube.
  r.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ title: requiredText(200).optional(), description: optionalText(2000) }).parse(req.body);
    await own.playlist(db, req.user.id, id);
    const p = await db.playlist.update({
      where: { id },
      data: { ...(body.title !== undefined && { title: body.title }), ...(body.description !== undefined && { description: body.description }), isCustomized: true },
    });
    ok(res, serializePlaylist(p, await buildIndex(db, req.user.id)));
  });

  /**
   * Safe to retry: progress, notes, favorites and video identities are preserved; vanished items are flagged, not deleted.
   * Videos the user removed (exclusions) are skipped. Pass `restore` (YouTube video ids) to un-remove some first.
   */
  r.post('/:id/sync', ...expensive, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { restore = [] } = z.object({ restore: z.array(z.string().max(32)).max(1000).optional() }).parse(req.body ?? {});
    const userId = req.user.id;
    const existing = await own.playlist(db, userId, id);
    if (!existing.youtubePlaylistId) throw unprocessable('This is a local collection, so there is nothing to synchronise with YouTube.');
    const c = await fetchPlaylist(yt, cache, existing.youtubePlaylistId, true);
    const result = await db.$transaction(
      async (tx) => {
        const playlist = await upsertPlaylistRecord(tx, userId, c);
        if (restore.length) await tx.playlistExclusion.deleteMany({ where: { playlistId: id, youtubeVideoId: { in: restore } } });
        const excluded = new Set((await tx.playlistExclusion.findMany({ where: { playlistId: id }, select: { youtubeVideoId: true } })).map((e) => e.youtubeVideoId));
        // New videos that are already elsewhere in the library are skipped and remembered as exclusions,
        // so they never appear twice; they can be restored from the playlist's "Removed videos" list.
        const restoring = new Set(restore);
        const dupes = await duplicatesElsewhere(tx, userId, c.videos.filter((v) => !excluded.has(v.youtubeVideoId) && !restoring.has(v.youtubeVideoId)).map((v) => v.youtubeVideoId), id);
        const dupeVideos = c.videos.filter((v) => dupes.has(v.youtubeVideoId));
        if (dupeVideos.length) {
          await tx.playlistExclusion.createMany({ data: dupeVideos.map((v) => ({ playlistId: id, youtubeVideoId: v.youtubeVideoId, title: v.title, thumbnailUrl: v.thumbnailUrl })), skipDuplicates: true });
          dupeVideos.forEach((v) => excluded.add(v.youtubeVideoId));
        }
        const videos = c.videos.filter((v) => !excluded.has(v.youtubeVideoId));
        const { map, created } = await upsertYoutubeVideos(tx, userId, videos);
        const sync = await syncPlaylistItems(tx, playlist.id, videos, map);
        await recordActivity(tx, userId, 'PLAYLIST_SYNCED', { playlistId: playlist.id, metadata: { added: sync.added, removed: sync.removed, restored: restore.length } });
        return { playlist, newVideos: created, addedItems: sync.added, removedFromSource: sync.removed, skippedExcluded: excluded.size, skippedDuplicates: dupeVideos.length };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    ok(res, { ...result, playlist: serializePlaylist(result.playlist, await buildIndex(db, userId)), truncated: c.truncated });
  });

  /** Remove selected videos from this playlist. Imported playlists remember the removal (restorable). */
  r.post('/:id/videos/remove', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { videoIds } = z.object({ videoIds: z.array(z.string().max(64)).min(1).max(1000) }).parse(req.body);
    const userId = req.user.id;
    const playlist = await own.playlist(db, userId, id);
    const result = await db.$transaction((tx) => removePlaylistItems(tx, userId, playlist, videoIds, Boolean(playlist.youtubePlaylistId)));
    ok(res, { ...result, restorable: Boolean(playlist.youtubePlaylistId) });
  });

  // Local collections only: imported playlists mirror their YouTube source.
  r.post('/:id/videos', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { videoId } = z.object({ videoId: z.string() }).parse(req.body);
    const userId = req.user.id;
    const playlist = await own.playlist(db, userId, id);
    await own.video(db, userId, videoId);
    if (playlist.youtubePlaylistId) throw unprocessable('Videos can only be added to local collections. Imported playlists follow their YouTube source.');
    const max = await db.playlistVideo.aggregate({ where: { playlistId: id }, _max: { position: true } });
    await db.playlistVideo.upsert({ where: { playlistId_videoId: { playlistId: id, videoId } }, create: { playlistId: id, videoId, position: (max._max.position ?? -1) + 1 }, update: { removedFromSource: false } });
    ok(res, { ok: true }, 201);
  });

  r.delete('/:id/videos/:videoId', async (req, res) => {
    const { id, videoId } = z.object({ id: z.string(), videoId: z.string() }).parse(req.params);
    const userId = req.user.id;
    const playlist = await own.playlist(db, userId, id);
    const result = await db.$transaction((tx) => removePlaylistItems(tx, userId, playlist, [videoId], Boolean(playlist.youtubePlaylistId)));
    ok(res, { deleted: true, ...result });
  });

  // Deletes the playlist and its placements. Videos (and their progress/notes) stay in the library
  // unless `deleteOrphanVideos` is set, which removes only videos that nothing else references.
  r.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { deleteOrphanVideos } = z.object({ deleteOrphanVideos: z.enum(['true', 'false']).optional() }).parse(req.query);
    const userId = req.user.id;
    await own.playlist(db, userId, id);
    let removedVideos = 0;
    await db.$transaction(async (tx) => {
      const items = await tx.playlistVideo.findMany({ where: { playlistId: id }, select: { videoId: true } });
      await tx.playlist.delete({ where: { id } });
      if (deleteOrphanVideos === 'true' && items.length) {
        const orphans = await tx.video.findMany({
          where: {
            userId,
            id: { in: items.map((i) => i.videoId) },
            playlistItems: { none: {} },
            placements: { none: {} },
            favorites: { none: {} },
            progress: { none: { status: { not: 'NOT_STARTED' } } },
            notes: { none: { content: { not: '' } } },
          },
          select: { id: true },
        });
        removedVideos = (await tx.video.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } })).count;
      }
    });
    ok(res, { deleted: true, removedVideos });
  });

  return r;
}
