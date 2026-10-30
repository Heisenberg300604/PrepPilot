import type { LibraryIndex } from './stats.js';
import { EMPTY } from './stats.js';

type VideoRow = {
  id: string;
  youtubeVideoId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  availabilityStatus: string;
  isCustomized: boolean;
  createdAt: Date;
  progress?: { status: string; lastPositionSeconds: number; lastStudiedAt: Date | null; completedAt: Date | null }[];
  favorites?: { id: string }[];
};

export const videoInclude = { progress: true, favorites: true } as const;

export function serializeVideo(v: VideoRow, extra: Record<string, unknown> = {}) {
  const p = v.progress?.[0];
  return {
    id: v.id,
    youtubeVideoId: v.youtubeVideoId,
    title: v.title,
    description: v.description,
    thumbnailUrl: v.thumbnailUrl,
    sourceUrl: v.sourceUrl,
    channelTitle: v.channelTitle,
    durationSeconds: v.durationSeconds,
    availabilityStatus: v.availabilityStatus,
    isCustomized: v.isCustomized,
    createdAt: v.createdAt,
    status: p?.status ?? 'NOT_STARTED',
    lastPositionSeconds: p?.lastPositionSeconds ?? 0,
    lastStudiedAt: p?.lastStudiedAt ?? null,
    completedAt: p?.completedAt ?? null,
    favorite: Boolean(v.favorites?.length),
    ...extra,
  };
}

export function serializePlaylist(p: any, idx: LibraryIndex, extra: Record<string, unknown> = {}) {
  return {
    id: p.id,
    youtubePlaylistId: p.youtubePlaylistId,
    title: p.title,
    description: p.description,
    thumbnailUrl: p.thumbnailUrl,
    sourceUrl: p.sourceUrl,
    channelTitle: p.channelTitle,
    lastSyncedAt: p.lastSyncedAt,
    isCustomized: p.isCustomized,
    createdAt: p.createdAt,
    stats: idx.stats(idx.playlistVideos.get(p.id) ?? EMPTY),
    ...extra,
  };
}
