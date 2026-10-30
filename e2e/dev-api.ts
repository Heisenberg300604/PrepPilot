/**
 * API for browser journeys: the real Express app + real PostgreSQL (preppilot_qa), with
 *  - identity taken from "Authorization: Bearer <user id>" (stand-in for Clerk — see e2e/clerk-mock.tsx), and
 *  - a fake YouTube Data API so playlist import is deterministic.
 * Never deploy this file; it exists to run UI journeys.
 */
import { createApp } from '../server/src/app.js';
import { loadConfig } from '../server/src/config.js';
import { createPrisma } from '../server/src/db.js';
import type { YouTubeApi, YtVideo } from '../server/src/youtube/client.js';
import { YouTubeError } from '../server/src/youtube/client.js';

const url = process.env.E2E_DATABASE_URL ?? 'postgresql://localhost:5432/preppilot_qa';
if (!/_qa$|_test$|_e2e$/.test(url)) throw new Error('E2E database name must end in _qa, _test or _e2e');
const db = createPrisma(url);
const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, CLIENT_ORIGIN: 'http://localhost:5180', API_PORT: '4100' } as NodeJS.ProcessEnv);

const vid = (n: number): YtVideo => ({
  youtubeVideoId: `e2eVid${String(n).padStart(5, "0")}`,
  title: `Quadratic Equations — Lecture ${n}`,
  description: 'A deterministic test lecture.',
  thumbnailUrl: null,
  channelTitle: 'PrepPilot Test Channel',
  durationSeconds: 600 + n * 60,
  availability: 'AVAILABLE',
  position: n - 1,
});
const youtube: YouTubeApi = {
  configured: true,
  async getPlaylistContents(id) {
    if (id !== 'PLe2eplaylist01') throw new YouTubeError('NOT_FOUND', 'That playlist was not found, or it is private.');
    return {
      playlist: { youtubePlaylistId: id, title: 'Algebra Foundations', description: 'Test playlist', thumbnailUrl: null, channelTitle: 'PrepPilot Test Channel' },
      videos: [1, 2, 3, 4].map(vid),
      truncated: false,
    };
  },
  async getVideo(id) {
    return { ...vid(99), youtubeVideoId: id, title: 'A single lecture' };
  },
};

const app = createApp({
  config,
  db,
  youtube,
  rateLimits: false,
  playlistCacheTtlMs: 0,
  resolveUser: (req) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null,
});
app.listen(4100, () => console.log('e2e API on :4100'));
