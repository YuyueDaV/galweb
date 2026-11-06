import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './scripts/quality/e2e-teardown.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3117',
    browserName: 'chromium',
    channel: process.env.CZX_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/quality/e2e-server.mjs',
    url: 'http://127.0.0.1:3117',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
