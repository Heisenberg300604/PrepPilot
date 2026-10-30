import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema> & { features: { youtube: boolean; clerkWebhooks: boolean } };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server configuration. Copy .env.example to .env and fill in:\n${lines}`);
  }
  const c = parsed.data;
  return {
    ...c,
    features: { youtube: Boolean(c.YOUTUBE_API_KEY), clerkWebhooks: Boolean(c.CLERK_WEBHOOK_SECRET) },
  };
}

/**
 * CLIENT_ORIGIN may list several origins. Browsers send origins with no trailing slash and no quotes, and CORS is an
 * exact match, so tolerate the common copy/paste slips (trailing "/", wrapping quotes, stray spaces).
 */
export function parseOrigins(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
