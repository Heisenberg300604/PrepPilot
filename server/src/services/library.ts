import type { Db, Tx } from '../db.js';
import { YouTubeError, type YouTubeApi, type YtPlaylistContents, type YtVideo } from '../youtube/client.js';
import { AppError } from '../errors.js';
import { playlistSourceUrl, videoSourceUrl } from '../youtube/parse.js';

/** Maps YouTube failures to HTTP errors with specific, actionable messages. */
export function youtubeToAppError(e: unknown): unknown {
  if (!(e instanceof YouTubeError)) return e;
  const status = { NOT_CONFIGURED: 503, NOT_FOUND: 404, PRIVATE: 403, QUOTA_EXCEEDED: 503, RATE_LIMITED: 429, UPSTREAM_ERROR: 502, NETWORK: 502 }[e.code];
  return new AppError(status, `YOUTUBE_${e.code}`, e.message);
}

/** Short-lived cache of public playlist metadata so preview -> import does not spend quota twice. */
export class PlaylistCache {
  private entries = new Map<string, { at: number; value: YtPlaylistContents }>();
  constructor(private ttlMs = 5 * 60_000, private max = 50) {}
  get(id: string) {
    const hit = this.entries.get(id);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.entries.delete(id);
      return undefined;
    }
    return hit.value;
  }
  set(id: string, value: YtPlaylistContents) {
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(id, { at: Date.now(), value });
  }
}

export async function fetchPlaylist(yt: YouTubeApi, cache: PlaylistCache, id: string, fresh = false) {
  if (!fresh) {
    const hit = cache.get(id);
    if (hit) return hit;
  }
  try {
    const value = await yt.getPlaylistContents(id);
    cache.set(id, value);
    return value;
  } catch (e) {
    throw youtubeToAppError(e);
  }
}

/**
 * Create-or-refresh the user's video records for the given YouTube videos.
 * One record per (user, youtubeVideoId): re-importing or syncing never duplicates and never touches
 * progress/notes/favorites (those hang off the video id). Locally customised titles are preserved.
 */
export async function upsertYoutubeVideos(tx: Tx, userId: string, videos: YtVideo[]) {
  const ids = videos.map((v) => v.youtubeVideoId);
  const existing = await tx.video.findMany({ where: { userId, youtubeVideoId: { in: ids } } });
  const byYt = new Map(existing.map((v) => [v.youtubeVideoId!, v] as const));
  const toCreate = videos.filter((v) => !byYt.has(v.youtubeVideoId));
  if (toCreate.length) {
    await tx.video.createMany({
      data: toCreate.map((v) => ({
        userId,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        description: v.description,
        thumbnailUrl: v.thumbnailUrl,
        channelTitle: v.channelTitle,
        durationSeconds: v.durationSeconds,
        availabilityStatus: v.availability,
        sourceUrl: videoSourceUrl(v.youtubeVideoId),
      })),
      skipDuplicates: true,
    });
  }
  const freshById = new Map(videos.map((x) => [x.youtubeVideoId, x] as const));
  for (const v of existing) {
    const fresh = freshById.get(v.youtubeVideoId!)!;
    const data: Record<string, unknown> = {};
    if (!v.isCustomized && fresh.title !== v.title && fresh.availability === 'AVAILABLE') data.title = fresh.title;
    if (!v.isCustomized && fresh.description && fresh.description !== v.description) data.description = fresh.description;
    if (fresh.thumbnailUrl && fresh.thumbnailUrl !== v.thumbnailUrl) data.thumbnailUrl = fresh.thumbnailUrl;
    if (fresh.channelTitle && fresh.channelTitle !== v.channelTitle) data.channelTitle = fresh.channelTitle;
    if (fresh.durationSeconds != null && fresh.durationSeconds !== v.durationSeconds) data.durationSeconds = fresh.durationSeconds;
    if (fresh.availability !== v.availabilityStatus && !(fresh.availability === 'UNAVAILABLE' && v.availabilityStatus !== 'AVAILABLE' && v.availabilityStatus !== 'UNKNOWN')) data.availabilityStatus = fresh.availability;
    if (Object.keys(data).length) await tx.video.update({ where: { id: v.id }, data });
  }
  const all = await tx.video.findMany({ where: { userId, youtubeVideoId: { in: ids } }, select: { id: true, youtubeVideoId: true } });
  return { map: new Map(all.map((v) => [v.youtubeVideoId!, v.id] as const)), created: toCreate.length };
}

/** Reconciles playlist membership with the source. Never deletes rows: vanished items are flagged. */
export async function syncPlaylistItems(tx: Tx, playlistId: string, videos: YtVideo[], videoIds: Map<string, string>) {
  const items = await tx.playlistVideo.findMany({ where: { playlistId } });
  const byVideo = new Map(items.map((i) => [i.videoId, i] as const));
  const seen = new Set<string>();
  const toCreate: { playlistId: string; videoId: string; position: number }[] = [];
  let position = 0;
  for (const v of videos) {
    const videoId = videoIds.get(v.youtubeVideoId);
    if (!videoId || seen.has(videoId)) continue;
    seen.add(videoId);
    const item = byVideo.get(videoId);
    if (!item) toCreate.push({ playlistId, videoId, position });
    else if (item.position !== position || item.removedFromSource) await tx.playlistVideo.update({ where: { id: item.id }, data: { position, removedFromSource: false } });
    position++;
  }
  if (toCreate.length) await tx.playlistVideo.createMany({ data: toCreate, skipDuplicates: true });
  // Items that vanished from the source are kept (with their progress/notes), flagged, and parked after the live items.
  const unseen = items.filter((i) => !seen.has(i.videoId)).sort((a, b) => a.position - b.position);
  let newlyRemoved = 0;
  for (const i of unseen) {
    if (!i.removedFromSource) newlyRemoved++;
    if (!i.removedFromSource || i.position !== position) await tx.playlistVideo.update({ where: { id: i.id }, data: { removedFromSource: true, position } });
    position++;
  }
  return { added: toCreate.length, removed: newlyRemoved };
}

export async function upsertPlaylistRecord(tx: Tx, userId: string, c: YtPlaylistContents) {
  const p = c.playlist;
  const existing = await tx.playlist.findFirst({ where: { userId, youtubePlaylistId: p.youtubePlaylistId } });
  const meta = { thumbnailUrl: p.thumbnailUrl, channelTitle: p.channelTitle, lastSyncedAt: new Date() };
  if (existing) {
    return tx.playlist.update({
      where: { id: existing.id },
      data: { ...meta, ...(existing.isCustomized ? {} : { title: p.title, description: p.description }) },
    });
  }
  return tx.playlist.create({
    data: { userId, youtubePlaylistId: p.youtubePlaylistId, title: p.title, description: p.description, sourceUrl: playlistSourceUrl(p.youtubePlaylistId), ...meta },
  });
}

export interface LocationLabel {
  examId: string;
  examName: string;
  subjectId: string;
  subjectName: string;
  folderId: string | null;
  folderPath: string[];
}

/** Resolve human-readable hierarchy labels for a batch of (exam, subject, folder) locations. */
export async function labelLocations(db: Db, userId: string, locs: { examId: string; subjectId: string; folderId: string | null }[]): Promise<LocationLabel[]> {
  if (!locs.length) return [];
  const subjectIds = [...new Set(locs.map((l) => l.subjectId))];
  const [exams, subjects, folders] = await Promise.all([
    db.exam.findMany({ where: { userId, id: { in: [...new Set(locs.map((l) => l.examId))] } }, select: { id: true, name: true } }),
    db.subject.findMany({ where: { userId, id: { in: subjectIds } }, select: { id: true, name: true } }),
    db.folder.findMany({ where: { userId, subjectId: { in: subjectIds } }, select: { id: true, name: true, parentFolderId: true } }),
  ]);
  const ex = new Map(exams.map((e) => [e.id, e.name] as const));
  const sj = new Map(subjects.map((s) => [s.id, s.name] as const));
  const fo = new Map(folders.map((f) => [f.id, f] as const));
  return locs.map((l) => {
    const folderPath: string[] = [];
    for (let f = l.folderId ? fo.get(l.folderId) : undefined; f; f = f.parentFolderId ? fo.get(f.parentFolderId) : undefined) folderPath.unshift(f.name);
    return { ...l, examName: ex.get(l.examId) ?? '', subjectName: sj.get(l.subjectId) ?? '', folderPath };
  });
}

/**
 * Removes videos from a playlist (the videos' own records are not touched unless nothing else uses them).
 * For imported playlists the removal is remembered as an exclusion so sync never silently re-adds them.
 * `pruneOrphans` deletes videos left with no playlist, placement, favourite, progress or note — safe because
 * nothing of the user's is attached to them; used for imported playlists, not hand-built collections.
 */
export async function removePlaylistItems(tx: Tx, userId: string, playlist: { id: string; youtubePlaylistId: string | null }, videoIds: string[], pruneOrphans: boolean) {
  const items = await tx.playlistVideo.findMany({ where: { playlistId: playlist.id, videoId: { in: videoIds } }, include: { video: true } });
  if (!items.length) return { removed: 0, deletedVideos: 0 };
  if (playlist.youtubePlaylistId) {
    const rows = items
      .filter((i) => i.video.youtubeVideoId)
      .map((i) => ({ playlistId: playlist.id, youtubeVideoId: i.video.youtubeVideoId!, title: i.video.title, thumbnailUrl: i.video.thumbnailUrl }));
    if (rows.length) await tx.playlistExclusion.createMany({ data: rows, skipDuplicates: true });
  }
  await tx.playlistVideo.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
  let deletedVideos = 0;
  if (pruneOrphans) {
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
    deletedVideos = (await tx.video.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } })).count;
  }
  return { removed: items.length, deletedVideos };
}

/**
 * YouTube ids (from `youtubeVideoIds`) the user already has somewhere else in their library — placed
 * directly in a subject/folder or in another playlist. Importing/syncing skips these so the same lecture
 * never shows up twice.
 *
 * `includeMembers` also reports videos that are already in `playlistId` (the import preview, where the user
 * reviews the list and unticking removes them). Sync leaves it off so it never silently drops existing items.
 */
export async function duplicatesElsewhere(db: Db | Tx, userId: string, youtubeVideoIds: string[], playlistId: string | null, { includeMembers = false } = {}): Promise<Set<string>> {
  if (!youtubeVideoIds.length) return new Set();
  const rows = await db.video.findMany({
    where: {
      userId,
      youtubeVideoId: { in: youtubeVideoIds },
      OR: [{ placements: { some: {} } }, { playlistItems: { some: playlistId ? { playlistId: { not: playlistId } } : {} } }],
      ...(playlistId && !includeMembers ? { NOT: { playlistItems: { some: { playlistId } } } } : {}),
    },
    select: { youtubeVideoId: true },
  });
  return new Set(rows.map((r) => r.youtubeVideoId!));
}
