# PrepPilot

> Your preparation. Your pace. Your progress.

PrepPilot is a personal study-management app for exam aspirants and self-learners. Organise your syllabus
(exam → subject → nested folders), collect YouTube lectures and playlists, track completion per lecture, keep
notes next to each video, and plan each day.

PrepPilot **does not host or download videos**. It stores official YouTube links and plays them through the
official YouTube embedded player. It only tracks viewing that happens inside its own player.

## Architecture

```
React + Vite SPA (src/)             ← Clerk React SDK (sign-in UI, session)
        │  Authorization: Bearer <Clerk session token>
        ▼
Express + TypeScript API (server/)  ← @clerk/express verifies the token on every /api route
        │  Prisma ORM (driver adapter: pg)
        ▼
PostgreSQL (prisma/)                ← users' study data; Clerk owns identity (no passwords stored here)

YouTube Data API v3 is called server-side only (key never reaches the browser).
```

| Concern | Choice |
| --- | --- |
| Frontend | React 19, Vite, TypeScript, React Router, TanStack Query, plain CSS design tokens (light/dark) |
| Backend | Node.js, Express 5, TypeScript, Zod validation, Helmet, CORS allow-list, rate limiting, Pino logs |
| Database | PostgreSQL + Prisma 7 (migrations committed in `prisma/migrations`) |
| Auth | Clerk (mandatory). Backend identity comes only from the verified session, never from client input |
| Video | Official YouTube Data API v3 (import/metadata) + IFrame Player API (playback) |

### Data model (high level)

`UserProfile` (keyed by Clerk id) → `Exam` → `Subject` → nested `Folder`s. Content is stored once and *placed*:
`Playlist` / `Video` are user-scoped records; `PlaylistPlacement` / `VideoPlacement` say where they appear
(subject root or a folder) with real foreign keys, so the same lecture can live in several places without
duplication. Progress (`VideoProgress`), `VideoNote`, `Favorite` are one row per user+video, so a lecture has
one consistent status wherever it appears. Subject/exam/folder progress counts **unique videos** in scope.
Also: `PlaylistVideo` (ordered membership), `StudyTask` (planner), `StudyActivity` (only real events).

See [`prisma/schema.prisma`](prisma/schema.prisma). Extra integrity rules Prisma can't express (partial unique
indexes for placements, non-negative CHECK constraints) live in the migration SQL.

### Behavioural decisions worth knowing

* **Ownership:** every query filters by the authenticated user's id. Someone else's resource returns `404`, identical
  to a missing one, so existence is never revealed.
* **Deleting** an exam/subject/folder removes the *structure and placements* only. Videos, playlists, progress, notes
  and favourites are kept. Deleting a video/playlist that is still in use needs explicit confirmation.
* **Choosing videos:** when importing a playlist you can untick videos you don't want, and you can remove videos from a playlist
  later (one at a time or in bulk). Removals are remembered per playlist, so **sync never adds them back**; they're listed under
  "Removed videos" with a Restore button. Your progress, notes and favourites on removed videos are kept.
* **Sync** never deletes your data: removed YouTube items are flagged and parked at the end of the playlist; progress,
  notes, favourites and locally edited titles are preserved. Sync is safe to retry.
* **Local edits** (titles/descriptions) only change PrepPilot — never YouTube.
* **Dates:** planner dates are calendar dates (`YYYY-MM-DD`, Postgres `DATE`) in the student's local time zone; the
  browser supplies "today". Task durations are *estimates*, not measured study time.
* **Playback position** and **completion** are separate. Manual completion always works; the player only *suggests*
  completion past a configurable threshold (default 90%, set 0 to disable).
* Without `YOUTUBE_API_KEY`, playlist import is disabled with an honest message and **manual video entry still works**.

## Getting started

Requirements: Node 20+ (tested on 24), npm, PostgreSQL 14+ (local, or a managed provider).

```bash
npm install                     # also runs `prisma generate`
cp .env.example .env            # then fill in the values below
npx prisma migrate deploy       # applies committed migrations (use `npm run db:migrate` while developing schema changes)
npm run dev                     # web on http://localhost:5173, API on http://localhost:4000
```

> **After pulling changes that touch `prisma/`, run `npx prisma migrate deploy` before starting the API.** The code and the
> database schema must match; otherwise requests that use a new table fail with a 500. Migrations are additive and safe to re-run.

### 1. Database (Prisma Postgres or any PostgreSQL)

*Prisma Postgres (preferred managed option):* create a database in the Prisma Data Platform console, copy the
connection string into `DATABASE_URL`. If the provider gives you a pooled URL *and* a direct URL, put the direct one in
`DIRECT_URL` (used only by `prisma migrate`). Then run `npx prisma migrate deploy`.

*Any other PostgreSQL* (Neon, RDS, local…) works unchanged — only `DATABASE_URL` differs.

Local example: `createdb preppilot` and `DATABASE_URL="postgresql://USER@localhost:5432/preppilot"`.

### 2. Clerk

1. Create an application at <https://dashboard.clerk.com> (enable the sign-in methods you want: email, Google, …).
2. API keys → copy the **Publishable key** and **Secret key**.
3. In `.env` set `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` (same publishable key) and `CLERK_SECRET_KEY`.
4. Clerk Dashboard → *Paths*: sign-in URL `/sign-in`, sign-up URL `/sign-up` (the app also passes these explicitly).
5. *(Optional but recommended)* Webhooks → add endpoint `https://<api-host>/api/webhooks/clerk`, subscribe to
   `user.created`, `user.updated`, `user.deleted`, copy the signing secret to `CLERK_WEBHOOK_SECRET`.
   The app does **not** depend on the webhook: a profile is created on first authenticated request. The webhook only
   keeps avatars in sync and removes data when an account is deleted; it never overwrites preferences you set in PrepPilot.
6. In production add your deployed frontend origin to Clerk's allowed origins and set `CLIENT_ORIGIN` on the API.

### 3. YouTube Data API (optional)

Google Cloud Console → enable *YouTube Data API v3* → create an API key → `YOUTUBE_API_KEY` (server only).
Restrict the key to the API and, where possible, to your server's IP. Playlist import costs roughly
`1 + ceil(n/50) + ceil(n/50)` quota units per playlist of *n* videos (the default quota is 10,000/day). Playlists are
capped at 500 imported videos per request.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API, Prisma | PostgreSQL connection string |
| `DIRECT_URL` | Prisma CLI (optional) | Non-pooled URL for migrations |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser | Clerk publishable key (safe to expose) |
| `CLERK_PUBLISHABLE_KEY` | API | Same key, read by `@clerk/express` |
| `CLERK_SECRET_KEY` | API | **Secret.** Verifies sessions |
| `CLERK_WEBHOOK_SECRET` | API (optional) | Verifies Clerk webhooks (Svix signature) |
| `YOUTUBE_API_KEY` | API (optional) | **Secret.** Enables playlist import & metadata |
| `API_PORT` | API | Default `4000` |
| `CLIENT_ORIGIN` | API | Comma-separated allowed browser origins (CORS) |
| `LOG_LEVEL` | API | Pino level, default `info` |
| `VITE_API_BASE_URL` | Browser | Public API URL in production; empty in dev (Vite proxies `/api`) |
| `VITE_SITE_URL` | Build (optional) | Public frontend URL for canonical/OG tags, JSON-LD and `sitemap.xml` (Vercel falls back to its production domain) |
| `TEST_DATABASE_URL` | Tests | Must end in `_test`; tests refuse to run otherwise |

Never commit `.env`. Only `VITE_*` values are bundled into the frontend; everything else stays on the server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Web (Vite) + API (tsx watch) together |
| `npm run build` | Typechecks and builds the SPA (`dist/`) and compiles the API (`server/dist/`) |
| `npm start` | Runs the compiled API (`node server/dist/index.js`) |
| `npm run typecheck` | Frontend + backend `tsc --noEmit` |
| `npm test` | All unit/integration tests (server project needs PostgreSQL; web project uses jsdom) |
| `npm run test:server` / `test:web` | One project at a time |
| `npm run test:e2e` | Browser journeys (see below) |
| `npm run db:migrate` / `db:deploy` | Create-and-apply (dev) / apply (prod) migrations |

## Testing

* **Server (`server/tests`)** — Vitest + Supertest against a **real PostgreSQL test database** (`preppilot_test`).
  Covers: auth rejection, cross-user isolation (read/update/delete/nested chains), exams/subjects/folders (nesting,
  circular-move prevention, cross-user moves), URL parsing, YouTube client error mapping & pagination, import,
  duplicate prevention, sync preserving progress/notes/favourites, shared placements, progress maths without
  double-counting, planner date handling, dashboard from real data, Clerk webhook signatures & idempotency.
  Create the DB once: `createdb preppilot_test && DATABASE_URL=postgresql://…/preppilot_test npx prisma migrate deploy`.
* **Web (`src/**/*.test.tsx`)** — Vitest + React Testing Library; only the network layer is stubbed.
* **Browser journeys (`e2e/`)** — Playwright drives the real UI against the real Express API and PostgreSQL
  (`preppilot_qa`). Two things are substituted, and these are *not* tested by it: Clerk (a test double in
  `e2e/clerk-mock.tsx`) and YouTube (a deterministic fake in `e2e/dev-api.ts`). Real Clerk sign-up/sign-in and real
  YouTube calls need real credentials and are verified manually (checklist below) or with
  [`@clerk/testing`](https://clerk.com/docs/testing/overview).

Manual checklist with real credentials: sign up → profile created → create exam/subject/folders → import a real
public playlist → watch, resume, complete → refresh → sign out → sign in as a second account and confirm
the first account's data is invisible.

## Deployment

Chosen architecture (three independent pieces):

| Piece | Host | Notes |
| --- | --- | --- |
| Frontend (static SPA) | **Vercel** (or any static host) | `vercel.json` provides the SPA fallback. Build: `npm run build:web`. Env: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE_URL=https://<api-host>` |
| API (long-running Node) | **Render / Railway / Fly.io** (anything that runs `node`) | Build: `npm ci && npm run build:api` (postinstall runs `prisma generate`). Release step: `npx prisma migrate deploy`. Start: `npm start`. Health check: `GET /api/health` |
| Database | **Prisma Postgres** (or any managed PostgreSQL) | Set `DATABASE_URL` (+ `DIRECT_URL` if pooled) |

API env in production: `NODE_ENV=production`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
`CLIENT_ORIGIN=https://<frontend-host>`, optional `YOUTUBE_API_KEY`, `CLERK_WEBHOOK_SECRET`. The Express API is **not**
deployed to Vercel's static hosting; it needs a Node host.

Run `prisma migrate deploy` (never `db push`) on every release; migrations are forward-only and committed.

## Security notes

* Clerk verifies every `/api` request (`clerkMiddleware` + `getAuth`); user ids from request bodies are ignored.
* Ownership is enforced in the query layer for every resource and every link in a chain (exam→subject→folder→content).
* Input validated with Zod; NUL bytes rejected; JSON body limit 256 kB; Helmet headers; CORS limited to `CLIENT_ORIGIN`;
  rate limits (600 req/min general, 20/min for YouTube-backed endpoints).
* The server never fetches user-supplied URLs: only the extracted video/playlist **id** is sent to the official API.
* Webhooks use Svix signature verification and idempotent upserts.
* Errors never leak stack traces or SQL in production.

## Known limitations

* Playlists import at most the first 500 videos (flagged to the user when truncated).
* Folder drag-and-drop is a desktop enhancement; **Move to…** menus are the complete, keyboard-accessible path.
* Study time is not measured — planner minutes are estimates, and only playback inside PrepPilot's player is tracked.
* Progress is lecture *completion*, not mastery.
* One note per user and video; no spaced-repetition, reminders or calendar integrations (intentionally out of scope for v1).
