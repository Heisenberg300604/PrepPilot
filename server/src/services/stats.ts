import type { Db } from '../db.js';
import type { ProgressStatus } from '../generated/prisma/client.js';

export interface Stats {
  total: number;
  completed: number;
  inProgress: number;
  remaining: number;
  percent: number;
}

/** Safe percentage: never NaN/Infinity, always an integer 0–100. */
export const percent = (done: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : 0);

export function statsFor(ids: Iterable<string>, status: Map<string, ProgressStatus>): Stats {
  const unique = new Set(ids);
  let completed = 0;
  let inProgress = 0;
  for (const id of unique) {
    const s = status.get(id);
    if (s === 'COMPLETED') completed++;
    else if (s === 'IN_PROGRESS') inProgress++;
  }
  const total = unique.size;
  return { total, completed, inProgress, remaining: total - completed, percent: percent(completed, total) };
}

/**
 * In-memory index of the user's hierarchy -> unique video ids, built from real rows.
 * A video counts once per scope no matter how many folders/playlists reference it.
 * Videos removed from a source playlist during sync are excluded from playlist membership.
 */
export interface LibraryIndex {
  status: Map<string, ProgressStatus>;
  playlistVideos: Map<string, string[]>; // ordered by position
  folderVideos: Map<string, Set<string>>; // includes descendant folders
  subjectVideos: Map<string, Set<string>>;
  examVideos: Map<string, Set<string>>;
  folderCounts: Map<string, number>; // direct child folders
  subjectFolderCount: Map<string, number>;
  stats: (ids: Iterable<string>) => Stats;
}

const add = <K>(m: Map<K, Set<string>>, k: K, v: Iterable<string>) => {
  let s = m.get(k);
  if (!s) m.set(k, (s = new Set()));
  for (const x of v) s.add(x);
};

export async function buildIndex(db: Db, userId: string): Promise<LibraryIndex> {
  const [folders, vPlace, pPlace, items, progress] = await Promise.all([
    db.folder.findMany({ where: { userId }, select: { id: true, subjectId: true, parentFolderId: true } }),
    db.videoPlacement.findMany({ where: { userId }, select: { videoId: true, examId: true, subjectId: true, folderId: true } }),
    db.playlistPlacement.findMany({ where: { userId }, select: { playlistId: true, examId: true, subjectId: true, folderId: true } }),
    db.playlistVideo.findMany({
      where: { playlist: { userId }, removedFromSource: false },
      select: { playlistId: true, videoId: true, position: true },
      orderBy: [{ playlistId: 'asc' }, { position: 'asc' }],
    }),
    db.videoProgress.findMany({ where: { userId }, select: { videoId: true, status: true } }),
  ]);

  const status = new Map(progress.map((p) => [p.videoId, p.status] as const));
  const playlistVideos = new Map<string, string[]>();
  for (const it of items) {
    const list = playlistVideos.get(it.playlistId);
    if (list) list.push(it.videoId);
    else playlistVideos.set(it.playlistId, [it.videoId]);
  }

  const parent = new Map(folders.map((f) => [f.id, f.parentFolderId] as const));
  const folderVideos = new Map<string, Set<string>>();
  const subjectVideos = new Map<string, Set<string>>();
  const examVideos = new Map<string, Set<string>>();

  const place = (loc: { examId: string; subjectId: string; folderId: string | null }, ids: string[]) => {
    add(subjectVideos, loc.subjectId, ids);
    add(examVideos, loc.examId, ids);
    // a video in a nested folder counts toward every ancestor folder
    for (let f = loc.folderId; f; f = parent.get(f) ?? null) add(folderVideos, f, ids);
  };
  for (const p of vPlace) place(p, [p.videoId]);
  for (const p of pPlace) place(p, playlistVideos.get(p.playlistId) ?? []);

  const folderCounts = new Map<string, number>();
  const subjectFolderCount = new Map<string, number>();
  for (const f of folders) {
    subjectFolderCount.set(f.subjectId, (subjectFolderCount.get(f.subjectId) ?? 0) + 1);
    if (f.parentFolderId) folderCounts.set(f.parentFolderId, (folderCounts.get(f.parentFolderId) ?? 0) + 1);
  }

  return { status, playlistVideos, folderVideos, subjectVideos, examVideos, folderCounts, subjectFolderCount, stats: (ids) => statsFor(ids, status) };
}

export const EMPTY: readonly string[] = [];
