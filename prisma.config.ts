import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Use DIRECT_URL (non-pooled) for migrations when your provider pools DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/preppilot',
  },
});
