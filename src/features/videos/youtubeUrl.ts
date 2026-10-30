// Client-side mirror of server/src/youtube/parse.ts, used only for instant form feedback.
// The server re-validates everything; this never fetches the URL.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

function toUrl(input: string): URL | null {
  const t = input.trim();
  if (!t || t.length > 2048) return null;
  try {
    return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
}

export function parseVideoUrl(input: string): string | null {
  const url = toUrl(input);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (HOSTS.has(host)) {
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,80}$/;
export function parsePlaylistUrl(input: string): string | null {
  const url = toUrl(input);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const id = url.searchParams.get('list');
  if (!id || !PLAYLIST_ID.test(id) || ['WL', 'LL', 'LM'].includes(id) || id.startsWith('RD')) return null;
  return id;
}
