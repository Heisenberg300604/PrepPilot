import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { createApp } from './app.js';

const config = loadConfig();
if (!config.CLERK_SECRET_KEY || !(config.CLERK_PUBLISHABLE_KEY || config.VITE_CLERK_PUBLISHABLE_KEY)) {
  console.error('Missing Clerk configuration: set CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY (or VITE_CLERK_PUBLISHABLE_KEY). See .env.example.');
  process.exit(1);
}
// @clerk/express reads CLERK_PUBLISHABLE_KEY; reuse the frontend key if only that one is set.
process.env.CLERK_PUBLISHABLE_KEY ??= config.VITE_CLERK_PUBLISHABLE_KEY;

const db = createPrisma(config.DATABASE_URL);
const app = createApp({ config, db });
const server = app.listen(config.API_PORT, () => {
  console.log(`PrepPilot API listening on :${config.API_PORT} (YouTube import ${config.features.youtube ? 'enabled' : 'disabled — YOUTUBE_API_KEY not set'})`);
});

const shutdown = () => server.close(() => db.$disconnect().finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
