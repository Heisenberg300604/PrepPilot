import { ApiError } from '@/lib/api';
import type { Video } from '@/lib/types';

/** Specific, actionable text for import/preview/sync failures. `retry` hints whether trying again can help. */
export function importErrorMessage(e: unknown): { message: string; retry: boolean } {
  if (!(e instanceof ApiError)) return { message: 'Something went wrong. Please try again.', retry: true };
  switch (e.code) {
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      return { message: e.message || 'That does not look like a YouTube playlist link.', retry: false };
    case 'YOUTUBE_NOT_FOUND':
      return { message: 'YouTube could not find that playlist. It may have been deleted or the link is wrong.', retry: false };
    case 'YOUTUBE_PRIVATE':
      return { message: 'That playlist is private. Set it to Public or Unlisted on YouTube, then try again.', retry: true };
    case 'YOUTUBE_QUOTA_EXCEEDED':
      return { message: "PrepPilot's YouTube quota is used up for today. Try again tomorrow, or add videos one by one.", retry: false };
    case 'YOUTUBE_RATE_LIMITED':
    case 'RATE_LIMITED':
      return { message: 'Too many requests right now. Wait a moment and try again.', retry: true };
    case 'YOUTUBE_NOT_CONFIGURED':
      return { message: 'Playlist import is not set up on this server (YOUTUBE_API_KEY is missing). You can still add videos manually.', retry: false };
    case 'EMPTY_PLAYLIST':
      return { message: 'This playlist has no videos to import.', retry: false };
    case 'NETWORK':
      return { message: e.message, retry: true };
    default:
      return { message: e.status >= 500 ? 'YouTube or PrepPilot had a problem. Please try again shortly.' : e.message, retry: e.status >= 500 };
  }
}

export type VideoFilter = 'ALL' | 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
export type VideoSort = 'ORDER' | 'TITLE' | 'DURATION' | 'STATUS';

const STATUS_RANK = { NOT_STARTED: 0, IN_PROGRESS: 1, COMPLETED: 2 } as const;

/** Client-side filter + sort. Original playlist order is the default; removed-from-source items always sink to the end. */
/** `completedLast` is a view preference: finished videos sink to the end without changing the saved order. */
export function filterSortVideos(videos: Video[], filter: VideoFilter, sort: VideoSort, completedLast = false): Video[] {
  const kept = videos.filter((v) => filter === 'ALL' || v.status === filter);
  const done = (v: Video) => Number(completedLast && v.status === 'COMPLETED');
  const cmp: Record<VideoSort, (a: Video, b: Video) => number> = {
    ORDER: (a, b) => (a.position ?? 0) - (b.position ?? 0),
    TITLE: (a, b) => a.title.localeCompare(b.title),
    DURATION: (a, b) => (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1),
    STATUS: (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.position ?? 0) - (b.position ?? 0),
  };
  return [...kept].sort((a, b) => Number(!!a.removedFromSource) - Number(!!b.removedFromSource) || done(a) - done(b) || cmp[sort](a, b));
}

/**
 * Moves `id` right before/after `targetId` in the full saved order. Working on the full list (not just
 * what's on screen) means videos hidden by the view, e.g. completed ones parked at the end, keep their slots.
 */
export function moveRelative(ids: string[], id: string, targetId: string, where: 'before' | 'after'): string[] {
  if (id === targetId || !ids.includes(id) || !ids.includes(targetId)) return ids;
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(targetId) + (where === 'after' ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** First video worth watching next: unfinished, still in the source, preferring in-progress ones. */
export function nextUnwatched(videos: Video[]): Video | undefined {
  const live = [...videos].filter((v) => !v.removedFromSource).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return live.find((v) => v.status === 'IN_PROGRESS') ?? live.find((v) => v.status !== 'COMPLETED') ?? live[0];
}

export const watchUrl = (videoId: string, playlistId?: string | null) => `/watch/${videoId}${playlistId ? `?playlist=${playlistId}` : ''}`;

// ── choosing which videos to import ──────────────────────────────────────────
/** Everything is selected, except videos the user previously removed from this playlist. */
export function initialSelection(videos: { youtubeVideoId: string }[], excludedIds: string[] = []): Set<string> {
  const excluded = new Set(excludedIds);
  return new Set(videos.filter((v) => !excluded.has(v.youtubeVideoId)).map((v) => v.youtubeVideoId));
}
export function toggleId(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
/** Select / deselect the contiguous run between two positions in the list (shift-click). */
export function setRange(selected: Set<string>, orderedIds: string[], from: number, to: number, on: boolean): Set<string> {
  const next = new Set(selected);
  const [a, b] = from <= to ? [from, to] : [to, from];
  for (const id of orderedIds.slice(Math.max(0, a), b + 1)) on ? next.add(id) : next.delete(id);
  return next;
}
export const allSelected = (selected: Set<string>, total: number) => total > 0 && selected.size === total;
/** Button label: "Import 12 videos" when everything is selected, otherwise "Import 7 of 12 videos". */
export function importLabel(count: number, total: number): string {
  if (count === 0) return 'Select videos to import';
  return count === total ? `Import ${count} ${count === 1 ? 'video' : 'videos'}` : `Import ${count} of ${total} videos`;
}
