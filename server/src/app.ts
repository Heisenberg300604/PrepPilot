import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { clerkClient } from '@clerk/express';
import { parseOrigins, type Config } from './config.js';
import type { Db } from './db.js';
import { clerkAuthMiddleware, clerkResolver, requireUser, type AuthResolver } from './auth.js';
import { badRequest, errorHandler, notFound } from './errors.js';
import { ok } from './http.js';
import { YouTubeClient, type YouTubeApi } from './youtube/client.js';
import { examsRouter } from './routes/exams.js';
import { subjectsRouter } from './routes/subjects.js';
import { foldersRouter } from './routes/folders.js';
import { placementsRouter } from './routes/placements.js';
import { playlistsRouter } from './routes/playlists.js';
import { videosRouter } from './routes/videos.js';
import { tasksRouter } from './routes/tasks.js';
import { resourcesRouter } from './routes/resources.js';
import { profileRouter, type IdentityLookup } from './routes/profile.js';
import { dashboardRouter } from './routes/dashboard.js';
import { webhooksRouter } from './routes/webhooks.js';

export interface AppDeps {
  config: Config;
  db: Db;
  /** Defaults to Clerk's verified session. Tests inject a stand-in; production never does. */
  resolveUser?: AuthResolver;
  youtube?: YouTubeApi;
  lookupIdentity?: IdentityLookup;
  rateLimits?: boolean;
  /** How long fetched playlist metadata is reused (preview -> import). */
  playlistCacheTtlMs?: number;
}

const clerkIdentity: IdentityLookup = async (id) => {
  const u = await clerkClient.users.getUser(id);
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null;
  return { displayName, avatarUrl: u.imageUrl ?? null };
};

export function createApp({ config, db, resolveUser, youtube, lookupIdentity, rateLimits = true, playlistCacheTtlMs }: AppDeps) {
  const isProd = config.NODE_ENV === 'production';
  const app = express();
  const yt = youtube ?? new YouTubeClient(config.YOUTUBE_API_KEY);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] }));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // API is consumed cross-origin by the SPA
  const origins = parseOrigins(config.CLIENT_ORIGIN);
  app.use(cors({ origin: origins, credentials: true }));

  // Raw-body webhook route must be registered before express.json().
  app.use('/api/webhooks', webhooksRouter(db, config.CLERK_WEBHOOK_SECRET));
  app.use(express.json({ limit: '256kb' }));

  // Postgres rejects NUL bytes with a driver error; refuse them up front with a clean 400.
  app.use((req, _res, next) => {
    if (req.originalUrl.includes('%00') || (req.body && JSON.stringify(req.body).includes('\\u0000'))) return next(badRequest('Invalid characters in request.'));
    next();
  });

  app.get('/api/health', (_req, res) => ok(res, { status: 'ok' }));

  const limiter = (windowMs: number, limit: number) =>
    rateLimits ? [rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } } })] : [];
  const resolver = resolveUser ?? clerkResolver;
  if (!resolveUser) app.use('/api', clerkAuthMiddleware(origins));

  const api = express.Router();
  for (const mw of limiter(60_000, 600)) api.use(mw);
  api.use(requireUser(db, resolver));
  api.get('/meta', (_req, res) => ok(res, { features: { youtubeImport: yt.configured } }));
  api.use('/profile', profileRouter(db, lookupIdentity ?? (resolveUser ? undefined : clerkIdentity)));
  api.use('/exams', examsRouter(db));
  api.use('/subjects', subjectsRouter(db));
  api.use('/', foldersRouter(db));
  api.use('/placements', placementsRouter(db));
  api.use('/playlists', playlistsRouter(db, yt, limiter(60_000, 20), playlistCacheTtlMs));
  api.use('/videos', videosRouter(db, yt));
  api.use('/tasks', tasksRouter(db));
  api.use('/', resourcesRouter(db));
  api.use('/', dashboardRouter(db));
  app.use('/api', api);

  app.use('/api', (_req, _res, next) => next(notFound('Route')));
  app.use(errorHandler(isProd));
  return app;
}
