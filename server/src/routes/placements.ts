import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { notFound } from '../errors.js';
import { ok } from '../http.js';
import { own, resolveDestination } from '../services/ownership.js';

const typeEnum = z.enum(['playlist', 'video']);
const dest = { subjectId: z.string(), folderId: z.string().nullable().optional() };

export function placementsRouter(db: Db) {
  const r = Router();

  /** Add a playlist/video to another location (it stays where it already is). Idempotent. */
  r.post('/', async (req, res) => {
    const body = z.object({ type: typeEnum, contentId: z.string(), ...dest }).parse(req.body);
    const userId = req.user.id;
    const loc = await resolveDestination(db, userId, body.subjectId, body.folderId);
    if (body.type === 'playlist') {
      await own.playlist(db, userId, body.contentId);
      const existing = await db.playlistPlacement.findFirst({ where: { userId, playlistId: body.contentId, subjectId: loc.subjectId, folderId: loc.folderId } });
      const p = existing ?? (await db.playlistPlacement.create({ data: { userId, playlistId: body.contentId, ...loc } }));
      ok(res, p, existing ? 200 : 201);
    } else {
      await own.video(db, userId, body.contentId);
      const existing = await db.videoPlacement.findFirst({ where: { userId, videoId: body.contentId, subjectId: loc.subjectId, folderId: loc.folderId } });
      const p = existing ?? (await db.videoPlacement.create({ data: { userId, videoId: body.contentId, ...loc } }));
      ok(res, p, existing ? 200 : 201);
    }
  });

  /** Move one placement to a new location. If the content is already there, the duplicate placement is dropped. */
  r.post('/:type/:id/move', async (req, res) => {
    const { type, id } = z.object({ type: typeEnum, id: z.string() }).parse(req.params);
    const body = z.object(dest).parse(req.body);
    const userId = req.user.id;
    const loc = await resolveDestination(db, userId, body.subjectId, body.folderId);
    const result = await db.$transaction(async (tx) => {
      if (type === 'playlist') {
        const cur = await tx.playlistPlacement.findFirst({ where: { id, userId } });
        if (!cur) throw notFound('Placement');
        const dup = await tx.playlistPlacement.findFirst({ where: { userId, playlistId: cur.playlistId, subjectId: loc.subjectId, folderId: loc.folderId, NOT: { id } } });
        if (dup) {
          await tx.playlistPlacement.delete({ where: { id } });
          return dup;
        }
        return tx.playlistPlacement.update({ where: { id }, data: loc });
      }
      const cur = await tx.videoPlacement.findFirst({ where: { id, userId } });
      if (!cur) throw notFound('Placement');
      const dup = await tx.videoPlacement.findFirst({ where: { userId, videoId: cur.videoId, subjectId: loc.subjectId, folderId: loc.folderId, NOT: { id } } });
      if (dup) {
        await tx.videoPlacement.delete({ where: { id } });
        return dup;
      }
      return tx.videoPlacement.update({ where: { id }, data: loc });
    });
    ok(res, result);
  });

  /** Removes only this placement. The underlying playlist/video and its progress are untouched. */
  r.delete('/:type/:id', async (req, res) => {
    const { type, id } = z.object({ type: typeEnum, id: z.string() }).parse(req.params);
    const userId = req.user.id;
    const { count } = type === 'playlist' ? await db.playlistPlacement.deleteMany({ where: { id, userId } }) : await db.videoPlacement.deleteMany({ where: { id, userId } });
    if (!count) throw notFound('Placement');
    ok(res, { deleted: true });
  });

  return r;
}
