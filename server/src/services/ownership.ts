import type { Db, Tx } from '../db.js';
import { notFound, unprocessable } from '../errors.js';

type Client = Db | Tx;

/**
 * Every lookup filters by userId. A resource that belongs to someone else is indistinguishable
 * from one that does not exist (404), so existence of other users' data is never revealed.
 */
export const own = {
  async exam(db: Client, userId: string, id: string) {
    return (await db.exam.findFirst({ where: { id, userId } })) ?? Promise.reject(notFound('Exam'));
  },
  async subject(db: Client, userId: string, id: string) {
    return (await db.subject.findFirst({ where: { id, userId } })) ?? Promise.reject(notFound('Subject'));
  },
  async folder(db: Client, userId: string, id: string) {
    return (await db.folder.findFirst({ where: { id, userId } })) ?? Promise.reject(notFound('Folder'));
  },
  async playlist(db: Client, userId: string, id: string) {
    return (await db.playlist.findFirst({ where: { id, userId } })) ?? Promise.reject(notFound('Playlist'));
  },
  async video(db: Client, userId: string, id: string) {
    return (await db.video.findFirst({ where: { id, userId } })) ?? Promise.reject(notFound('Video'));
  },
  async task(db: Client, userId: string, id: string) {
    return (await db.studyTask.findFirst({ where: { id, userId } })) ?? Promise.reject(notFound('Task'));
  },
};

export interface Destination {
  examId: string;
  subjectId: string;
  folderId: string | null;
}

/** Validates a (subject, optional folder) destination and returns the full resolved chain. */
export async function resolveDestination(db: Client, userId: string, subjectId: string, folderId?: string | null): Promise<Destination> {
  const subject = await own.subject(db, userId, subjectId);
  if (folderId) {
    const folder = await own.folder(db, userId, folderId);
    if (folder.subjectId !== subject.id) throw unprocessable('That folder does not belong to the selected subject.');
  }
  return { examId: subject.examId, subjectId: subject.id, folderId: folderId ?? null };
}

/** Folder ids of `folderId` and all its descendants (within one subject). */
export async function descendantFolderIds(db: Client, userId: string, folderId: string): Promise<string[]> {
  const folder = await own.folder(db, userId, folderId);
  const all = await db.folder.findMany({ where: { userId, subjectId: folder.subjectId }, select: { id: true, parentFolderId: true } });
  const byParent = new Map<string | null, string[]>();
  for (const f of all) byParent.set(f.parentFolderId, [...(byParent.get(f.parentFolderId) ?? []), f.id]);
  const out: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}
