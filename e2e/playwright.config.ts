import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const e2eDir = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(e2eDir, '..');
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174';
const mode = process.env.E2E_MODE ?? 'live';
const browserChannel = process.env.E2E_BROWSER_CHANNEL;

export default defineConfig({
  testDir: './tests',
  outputDir: './output/test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './output/report', open: 'never' }],
  ],
  use: {
    baseURL,
    video: 'on',
    ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === 'true',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1920, height: 1080 },
    ...(browserChannel ? { channel: browserChannel } : {}),
  },
  metadata: {
    recordingMode: mode,
    baseURL,
  },
  webServer: process.env.E2E_SKIP_WEBSERVER === 'true' ? undefined : {
    command: 'npm run dev --prefix frontend',
    cwd: repoDir,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
