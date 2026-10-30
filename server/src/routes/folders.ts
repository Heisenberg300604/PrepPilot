import { Router } from 'express';
import { z } from 'zod';
import type { Db } from '../db.js';
import { badRequest, unprocessable } from '../errors.js';
import { idParam, ok, optionalText, requiredText } from '../http.js';
import { descendantFolderIds, own } from '../services/ownership.js';
import { buildIndex, EMPTY } from '../services/stats.js';
import { recordActivity } from '../services/activity.js';
import { serializePlaylist, serializeVideo, videoInclude } from '../services/serializers.js';
import { serializeSubject } from './subjects.js';

export function foldersRouter(db: Db) {
  const r = Router();

  /** Flat folder list for a subject (the client builds the tree / "Move to" pickers). */
  r.get('/subjects/:id/folders', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const userId = req.user.id;
    await own.subject(db, userId, id);
    const [folders, idx] = await Promise.all([
      db.folder.findMany({ where: { userId, subjectId: id }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] }),
      buildIndex(db, userId),
    ]);
    ok(res, folders.map((f) => ({ ...f, childFolderCount: idx.folderCounts.get(f.id) ?? 0, stats: idx.stats(idx.folderVideos.get(f.id) ?? EMPTY) })));
  });

  /** Everything at one location: sub-folders, playlists, videos, plus a breadcrumb trail. */
  r.get('/subjects/:id/contents', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { folderId } = z.object({ folderId: z.string().optional() }).parse(req.query);
    const userId = req.user.id;
    const subject = await own.subject(db, userId, id);
    const folder = folderId ? await own.folder(db, userId, folderId) : null;
    if (folder && folder.subjectId !== id) throw unprocessable('That folder does not belong to this subject.');
    const where = { userId, subjectId: id, folderId: folderId ?? null };
    const [exam, idx, folders, pp, vp] = await Promise.all([
      own.exam(db, userId, subject.examId),
      buildIndex(db, userId),
      db.folder.findMany({ where: { userId, subjectId: id, parentFolderId: folderId ?? null }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] }),
      db.playlistPlacement.findMany({ where, include: { playlist: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] }),
      db.videoPlacement.findMany({ where, include: { video: { include: videoInclude } }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const breadcrumb: { id: string; name: string }[] = [];
    if (folder) {
      const all = await db.folder.findMany({ where: { userId, subjectId: id }, select: { id: true, name: true, parentFolderId: true } });
      const byId = new Map(all.map((f) => [f.id, f] as const));
      for (let f = byId.get(folder.id); f; f = f.parentFolderId ? byId.get(f.parentFolderId) : undefined) breadcrumb.unshift({ id: f.id, name: f.name });
    }
    ok(res, {
      subject: serializeSubject(subject, idx, { examName: exam.name }),
      exam: { id: exam.id, name: exam.name },
      folder: folder && { id: folder.id, name: folder.name, description: folder.description, parentFolderId: folder.parentFolderId },
      breadcrumb,
      folders: folders.map((f) => ({ ...f, childFolderCount: idx.folderCounts.get(f.id) ?? 0, stats: idx.stats(idx.folderVideos.get(f.id) ?? EMPTY) })),
      playlists: pp.map((p) => serializePlaylist(p.playlist, idx, { placementId: p.id })),
      videos: vp.map((p) => serializeVideo(p.video, { placementId: p.id })),
    });
  });

  r.post('/folders', async (req, res) => {
    const body = z.object({ subjectId: z.string(), parentFolderId: z.string().nullable().optional(), name: requiredText(120), description: optionalText(1000) }).parse(req.body);
    const userId = req.user.id;
    const subject = await own.subject(db, userId, body.subjectId);
    if (body.parentFolderId) {
      const parent = await own.folder(db, userId, body.parentFolderId);
      if (parent.subjectId !== subject.id) throw unprocessable('The parent folder belongs to a different subject.');
    }
    const max = await db.folder.aggregate({ where: { userId, subjectId: subject.id, parentFolderId: body.parentFolderId ?? null }, _max: { displayOrder: true } });
    const folder = await db.folder.create({
      data: { userId, subjectId: subject.id, parentFolderId: body.parentFolderId ?? null, name: body.name, description: body.description ?? null, displayOrder: (max._max.displayOrder ?? -1) + 1 },
    });
    await recordActivity(db, userId, 'FOLDER_CREATED', { folderId: folder.id, subjectId: subject.id, examId: subject.examId });
    ok(res, folder, 201);
  });

  r.patch('/folders/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ name: requiredText(120).optional(), description: optionalText(1000) }).parse(req.body);
    await own.folder(db, req.user.id, id);
    ok(res, await db.folder.update({ where: { id }, data: { ...(body.name !== undefined && { name: body.name }), ...(body.description !== undefined && { description: body.description }) } }));
  });

  /** Move a folder under another folder (or to the subject root); optionally into another subject. */
  r.post('/folders/:id/move', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ parentFolderId: z.string().nullable(), subjectId: z.string().optional() }).parse(req.body);
    const userId = req.user.id;
    const folder = await own.folder(db, userId, id);
    const targetSubject = await own.subject(db, userId, body.subjectId ?? folder.subjectId);
    const subtree = await descendantFolderIds(db, userId, id); // includes the folder itself
    if (body.parentFolderId) {
      const parent = await own.folder(db, userId, body.parentFolderId);
      if (parent.subjectId !== targetSubject.id) throw unprocessable('The destination folder belongs to a different subject.');
      if (subtree.includes(parent.id)) throw badRequest(parent.id === id ? 'A folder cannot be moved into itself.' : 'A folder cannot be moved into one of its own sub-folders.');
    }
    const moved = await db.$transaction(async (tx) => {
      const max = await tx.folder.aggregate({ where: { userId, subjectId: targetSubject.id, parentFolderId: body.parentFolderId }, _max: { displayOrder: true } });
      const m = await tx.folder.update({ where: { id }, data: { parentFolderId: body.parentFolderId, subjectId: targetSubject.id, displayOrder: (max._max.displayOrder ?? -1) + 1 } });
      if (targetSubject.id !== folder.subjectId) {
        await tx.folder.updateMany({ where: { id: { in: subtree } }, data: { subjectId: targetSubject.id } });
        const loc = { subjectId: targetSubject.id, examId: targetSubject.examId };
        await tx.playlistPlacement.updateMany({ where: { folderId: { in: subtree } }, data: loc });
        await tx.videoPlacement.updateMany({ where: { folderId: { in: subtree } }, data: loc });
      }
      return m;
    });
    ok(res, moved);
  });

  r.post('/folders/reorder', async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).min(1).max(500) }).parse(req.body);
    const userId = req.user.id;
    const rows = await db.folder.findMany({ where: { userId, id: { in: ids } }, select: { subjectId: true, parentFolderId: true } });
    if (rows.length !== new Set(ids).size) throw badRequest('Some folders could not be reordered.');
    if (new Set(rows.map((x) => `${x.subjectId}/${x.parentFolderId}`)).size !== 1) throw badRequest('Folders must share the same parent to be reordered.');
    await db.$transaction(ids.map((id, i) => db.folder.updateMany({ where: { id, userId }, data: { displayOrder: i } })));
    ok(res, { ok: true });
  });

  // Removes the folder, its sub-folders and the placements inside them. The playlists/videos themselves,
  // and their progress, notes and favorites, are kept and remain in the library.
  r.delete('/folders/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    await own.folder(db, req.user.id, id);
    await db.folder.delete({ where: { id } });
    ok(res, { deleted: true });
  });

  return r;
}
