const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
// Auto-generated lists (Liked videos, Watch later, Mixes, uploads) are private or not importable via the API.
const UNSUPPORTED_PLAYLIST_IDS = new Set(['WL', 'LL', 'LM']);

function toUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** Extracts a video id from watch / youtu.be / shorts / embed / live URLs. Never fetches the URL. */
export function parseVideoUrl(input: string): string | null {
  const url = toUrl(input);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (YT_HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

/** Extracts a playlist id from playlist?list=… or watch?v=…&list=… URLs. */
export function parsePlaylistUrl(input: string): string | null {
  const url = toUrl(input);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  if (!YT_HOSTS.has(url.hostname.toLowerCase())) return null;
  const id = url.searchParams.get('list');
  if (!id || !PLAYLIST_ID.test(id)) return null;
  if (UNSUPPORTED_PLAYLIST_IDS.has(id) || id.startsWith('RD')) return null;
  return id;
}

export const videoSourceUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const playlistSourceUrl = (id: string) => `https://www.youtube.com/playlist?list=${id}`;
export const isValidVideoId = (id: string) => VIDEO_ID.test(id);
