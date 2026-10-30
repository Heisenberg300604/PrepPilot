import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPrisma } from '../src/db.js';
import type { YouTubeApi, YtPlaylistContents, YtVideo } from '../src/youtube/client.js';
import { YouTubeError } from '../src/youtube/client.js';

function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL ?? (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/(\/[^/?]+)(\?|$)/, '$1_test$2') : '');
  if (!url) throw new Error('Set TEST_DATABASE_URL (or DATABASE_URL) to run server tests.');
  // Safety net: tests delete data, so only ever run against a database clearly named *_test.
  if (!/\/[^/?]*_test(\?|$)/.test(url)) throw new Error(`Refusing to run tests against a database not ending in "_test": ${url}`);
  return url;
}

export const db = createPrisma(testDatabaseUrl());
export const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: testDatabaseUrl(), CLIENT_ORIGIN: 'http://localhost:5173' } as NodeJS.ProcessEnv);

export class FakeYouTube implements YouTubeApi {
  configured = true;
  calls = { playlist: 0, video: 0 };
  playlists = new Map<string, YtPlaylistContents>();
  videos = new Map<string, YtVideo>();
  failWith: YouTubeError | null = null;
  get isConfigured() {
    return this.configured;
  }
  async getPlaylistContents(id: string) {
    this.calls.playlist++;
    if (!this.configured) throw new YouTubeError('NOT_CONFIGURED', 'YouTube import is not configured on this server (YOUTUBE_API_KEY is missing).');
    if (this.failWith) throw this.failWith;
    const p = this.playlists.get(id);
    if (!p) throw new YouTubeError('NOT_FOUND', 'That playlist was not found, or it is private.');
    return structuredClone(p);
  }
  async getVideo(id: string) {
    this.calls.video++;
    if (!this.configured) throw new YouTubeError('NOT_CONFIGURED', 'not configured');
    return this.videos.get(id) ?? null;
  }
}

export const ytVideo = (n: number, over: Partial<YtVideo> = {}): YtVideo => ({
  youtubeVideoId: `vid${String(n).padStart(8, '0')}`.slice(0, 11),
  title: `Lecture ${n}`,
  description: null,
  thumbnailUrl: `https://i.ytimg.com/vi/${n}/hq.jpg`,
  channelTitle: 'Test Channel',
  durationSeconds: 600 + n,
  availability: 'AVAILABLE',
  position: n - 1,
  ...over,
});

export const ytPlaylist = (id: string, videos: YtVideo[]): YtPlaylistContents => ({
  playlist: { youtubePlaylistId: id, title: 'Algebra Course', description: 'All of algebra', thumbnailUrl: 'https://i.ytimg.com/p.jpg', channelTitle: 'Test Channel' },
  videos: videos.map((v, i) => ({ ...v, position: i })),
  truncated: false,
});

const createdUsers = new Set<string>();

export function makeHarness(opts: { playlistCacheTtlMs?: number } = {}) {
  const youtube = new FakeYouTube();
  // The Clerk session check is replaced by a header here; everything past identity is the real app + real Postgres.
  const app = createApp({ config, db, youtube, rateLimits: false, playlistCacheTtlMs: opts.playlistCacheTtlMs ?? 0, resolveUser: (req) => (req.headers['x-test-user'] as string) || null });
  const as = (user: string | null) => {
    if (user) createdUsers.add(user);
    const set = (r: request.Test) => (user ? r.set('x-test-user', user) : r);
    return {
      get: (url: string) => set(request(app).get(url)),
      post: (url: string, body: unknown = {}) => set(request(app).post(url)).send(body as object),
      put: (url: string, body: unknown = {}) => set(request(app).put(url)).send(body as object),
      patch: (url: string, body: unknown = {}) => set(request(app).patch(url)).send(body as object),
      delete: (url: string) => set(request(app).delete(url)),
    };
  };
  return { app, as, youtube, newUser: () => `user_${randomUUID()}` };
}

/** Removes every profile created in this file (all owned rows cascade). */
export function cleanupUsers() {
  afterAll(async () => {
    await db.userProfile.deleteMany({ where: { clerkUserId: { in: [...createdUsers] } } });
    await db.$disconnect();
  });
}

/** Creates exam -> subject -> optional folder and returns ids. */
export async function seedWorkspace(api: ReturnType<ReturnType<typeof makeHarness>['as']>, names = { exam: 'CDS 2027', subject: 'Mathematics' }) {
  const exam = (await api.post('/api/exams', { name: names.exam })).body.data;
  const subject = (await api.post('/api/subjects', { examId: exam.id, name: names.subject })).body.data;
  const main = (await api.post('/api/folders', { subjectId: subject.id, name: 'Main Course' })).body.data;
  const revision = (await api.post('/api/folders', { subjectId: subject.id, name: 'Revision' })).body.data;
  return { exam, subject, main, revision };
}
