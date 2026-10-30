import type { VideoAvailability } from '../generated/prisma/client.js';

export type YouTubeErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'PRIVATE'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'NETWORK';

export class YouTubeError extends Error {
  constructor(public code: YouTubeErrorCode, message: string) {
    super(message);
  }
}

export interface YtPlaylist {
  youtubePlaylistId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  channelTitle: string | null;
}

export interface YtVideo {
  youtubeVideoId: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  durationSeconds: number | null;
  availability: VideoAvailability;
  /** Position in the source playlist (0-based). Undefined for standalone lookups. */
  position?: number;
}

export interface YtPlaylistContents {
  playlist: YtPlaylist;
  videos: YtVideo[];
  /** True when the playlist has more items than we are willing to fetch in one go. */
  truncated: boolean;
}

export interface YouTubeApi {
  readonly configured: boolean;
  getPlaylistContents(playlistId: string): Promise<YtPlaylistContents>;
  getVideo(videoId: string): Promise<YtVideo | null>;
}

const BASE = 'https://www.googleapis.com/youtube/v3';
export const MAX_PLAYLIST_ITEMS = 500;

export function parseIsoDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d = '0', h = '0', min = '0', s = '0'] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(min) * 60 + Number(s);
}

const pickThumb = (t: any): string | null =>
  t?.maxres?.url ?? t?.standard?.url ?? t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;

export class YouTubeClient implements YouTubeApi {
  constructor(
    private apiKey: string | undefined,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get configured() {
    return Boolean(this.apiKey);
  }

  private async call(path: string, params: Record<string, string>): Promise<any> {
    if (!this.apiKey) {
      throw new YouTubeError('NOT_CONFIGURED', 'YouTube import is not configured on this server (YOUTUBE_API_KEY is missing). You can still add videos manually.');
    }
    const qs = new URLSearchParams({ ...params, key: this.apiKey });
    let res: Response;
    try {
      res = await this.fetchImpl(`${BASE}/${path}?${qs}`, { signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new YouTubeError('NETWORK', 'Could not reach YouTube. Check your connection and try again.');
    }
    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw new YouTubeError('UPSTREAM_ERROR', 'YouTube returned an unexpected response.');
      }
    }
    let reason = '';
    try {
      reason = (await res.json())?.error?.errors?.[0]?.reason ?? '';
    } catch {
      /* ignore */
    }
    if (res.status === 403 && reason === 'quotaExceeded') throw new YouTubeError('QUOTA_EXCEEDED', 'The YouTube API daily quota has been used up. Try again tomorrow or add videos manually.');
    if (res.status === 429 || reason === 'rateLimitExceeded') throw new YouTubeError('RATE_LIMITED', 'YouTube is rate limiting requests. Wait a moment and try again.');
    if (res.status === 404 || reason === 'playlistNotFound' || reason === 'videoNotFound') throw new YouTubeError('NOT_FOUND', 'That playlist or video was not found on YouTube.');
    if (res.status === 403 && (reason === 'playlistForbidden' || reason === 'forbidden')) throw new YouTubeError('PRIVATE', 'That playlist is private. Set it to Public or Unlisted on YouTube and try again.');
    if (res.status === 400 && reason === 'keyInvalid') throw new YouTubeError('NOT_CONFIGURED', 'The configured YouTube API key was rejected by YouTube.');
    throw new YouTubeError('UPSTREAM_ERROR', `YouTube returned an error (${res.status}).`);
  }

  async getPlaylistContents(playlistId: string): Promise<YtPlaylistContents> {
    const meta = await this.call('playlists', { part: 'snippet', id: playlistId, maxResults: '1' });
    const p = meta?.items?.[0];
    if (!p) throw new YouTubeError('NOT_FOUND', 'That playlist was not found, or it is private.');
    const playlist: YtPlaylist = {
      youtubePlaylistId: playlistId,
      title: p.snippet?.title ?? 'Untitled playlist',
      description: p.snippet?.description || null,
      thumbnailUrl: pickThumb(p.snippet?.thumbnails),
      channelTitle: p.snippet?.channelTitle ?? null,
    };

    // Page through playlist items (50/page), bounded by MAX_PLAYLIST_ITEMS.
    const items: { id: string; position: number; title: string; description: string | null; thumb: string | null; channel: string | null; privacy?: string }[] = [];
    let pageToken: string | undefined;
    let truncated = false;
    do {
      const page = await this.call('playlistItems', {
        part: 'snippet,contentDetails,status',
        playlistId,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      for (const it of page?.items ?? []) {
        const id = it?.contentDetails?.videoId ?? it?.snippet?.resourceId?.videoId;
        if (!id) continue;
        items.push({
          id,
          position: it.snippet?.position ?? items.length,
          title: it.snippet?.title ?? 'Untitled video',
          description: it.snippet?.description || null,
          thumb: pickThumb(it.snippet?.thumbnails),
          channel: it.snippet?.videoOwnerChannelTitle ?? null,
          privacy: it.status?.privacyStatus,
        });
      }
      pageToken = page?.nextPageToken;
      if (pageToken && items.length >= MAX_PLAYLIST_ITEMS) {
        truncated = true;
        break;
      }
    } while (pageToken);

    const capped = items.slice(0, MAX_PLAYLIST_ITEMS);
    const details = await this.getVideoDetails([...new Set(capped.map((i) => i.id))]);
    const seen = new Set<string>();
    const videos: YtVideo[] = [];
    capped.forEach((it, index) => {
      if (seen.has(it.id)) return; // a playlist can list the same video twice; keep first occurrence
      seen.add(it.id);
      const d = details.get(it.id);
      const title = it.title;
      let availability: VideoAvailability = d ? 'AVAILABLE' : 'UNAVAILABLE';
      if (title === 'Private video' || it.privacy === 'private') availability = 'PRIVATE';
      else if (title === 'Deleted video') availability = 'REMOVED';
      videos.push({
        youtubeVideoId: it.id,
        title: d?.title ?? (availability === 'AVAILABLE' ? title : title),
        description: d?.description ?? it.description,
        thumbnailUrl: d?.thumbnailUrl ?? it.thumb,
        channelTitle: d?.channelTitle ?? it.channel,
        durationSeconds: d?.durationSeconds ?? null,
        availability,
        position: index,
      });
    });
    return { playlist, videos, truncated };
  }

  private async getVideoDetails(ids: string[]): Promise<Map<string, YtVideo>> {
    const out = new Map<string, YtVideo>();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const res = await this.call('videos', { part: 'snippet,contentDetails,status', id: chunk.join(','), maxResults: '50' });
      for (const v of res?.items ?? []) {
        out.set(v.id, {
          youtubeVideoId: v.id,
          title: v.snippet?.title ?? 'Untitled video',
          description: v.snippet?.description || null,
          thumbnailUrl: pickThumb(v.snippet?.thumbnails),
          channelTitle: v.snippet?.channelTitle ?? null,
          durationSeconds: parseIsoDuration(v.contentDetails?.duration),
          availability: v.status?.privacyStatus === 'private' ? 'PRIVATE' : 'AVAILABLE',
        });
      }
    }
    return out;
  }

  async getVideo(videoId: string): Promise<YtVideo | null> {
    const map = await this.getVideoDetails([videoId]);
    return map.get(videoId) ?? null;
  }
}
