import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: '.runtime/playwright-results',
  reporter: [
    ['list'], ['html', { outputFolder: '.runtime/playwright-report', open: 'never' }],
    ['junit', { outputFile: '.runtime/browser-results.xml' }],
  ],
  use: {
    actionTimeout: 10_000,
    baseURL: 'http://127.0.0.1:15173',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: 'node scripts/backend.mjs e2e',
      url: 'http://127.0.0.1:18003/health',
      reuseExistingServer: false,
      env: { QUESTION_TIME_LIMIT_SECONDS: '8', ALLOWED_ORIGINS: 'http://127.0.0.1:15173,http://127.0.0.1:18003' },
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 15173 --strictPort',
      url: 'http://127.0.0.1:15173',
      reuseExistingServer: false,
      env: { VITE_API_PROXY_TARGET: 'http://127.0.0.1:18003' },
    },
  ],
})
