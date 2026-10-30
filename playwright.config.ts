import { defineConfig, devices } from '@playwright/test';

// Browser journeys run against the real UI + real Express + real PostgreSQL (preppilot_qa),
// with a Clerk test double and a fake YouTube API (see e2e/*). Run: npm run test:e2e
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: '**/responsive.spec.ts' },
  ],
  webServer: [
    { command: 'npx tsx e2e/dev-api.ts', url: 'http://localhost:4100/api/health', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npx vite --config e2e/vite.e2e.config.ts', url: 'http://localhost:5180', reuseExistingServer: true, timeout: 60_000 },
  ],
});
