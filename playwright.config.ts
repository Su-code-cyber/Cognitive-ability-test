import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { loadRun } from './scripts/test-env.mjs'

const run = loadRun()
if (run.kind !== 'e2e' || !run.uiOrigin || !run.apiOrigin) throw new Error('Browser tests require an owned isolated run')

export default defineConfig({
  testDir: path.join(run.source, 'tests/e2e-built'),
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  outputDir: path.join(run.directory, 'artifacts'),
  reporter: [
    ['list'], ['html', { outputFolder: path.join(run.directory, 'reports', 'html'), open: 'never' }],
    ['junit', { outputFile: path.join(run.directory, 'reports', 'browser.xml') }],
  ],
  use: {
    actionTimeout: 10_000,
    baseURL: run.uiOrigin,
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
})
