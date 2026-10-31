import { test as base, expect, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test'
import { appendFileSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

interface TestRun {
  marker: string
  nonce: string
  directory: string
  status: string
  uiOrigin: string
  apiOrigin: string
}

if (process.env.EXAM_TEST_MODE !== '1' || !process.env.EXAM_TEST_RUN_DIR) throw new Error('Use npm run test:e2e; no development-service fallback is allowed')
const directory = realpathSync(process.env.EXAM_TEST_RUN_DIR)
export const run: TestRun = JSON.parse(readFileSync(path.join(directory, 'run.json'), 'utf8'))
if (run.marker !== 'question-isolated-tests-v1' || run.nonce !== process.env.EXAM_TEST_NONCE || run.status !== 'running') throw new Error('Invalid browser test identity')
const origins = new Set([run.uiOrigin, run.apiOrigin])
for (const origin of origins) {
  const url = new URL(origin)
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || ['5173', '8003', ''].includes(url.port)) throw new Error('Refusing a non-isolated browser target')
}

function allowed(input: string) {
  const url = new URL(input, run.uiOrigin)
  if (['data:', 'blob:', 'about:'].includes(url.protocol)) return true
  return origins.has(url.origin)
}

function audit(url: string, blocked: boolean) {
  const parsed = new URL(url, run.uiOrigin)
  // No bodies, passwords, cookies or query-string credentials enter the audit trail.
  appendFileSync(path.join(run.directory, 'reports', 'network-audit.jsonl'), JSON.stringify({ origin: parsed.origin, path: parsed.pathname, blocked }) + '\n')
}

function guardApi(request: APIRequestContext) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const) {
    const original = request[method].bind(request) as (...args: unknown[]) => unknown
    Object.defineProperty(request, method, {
      configurable: true,
      value: (...args: unknown[]) => {
        const input = args[0]
        const url = typeof input === 'string' ? input : (input as { url(): string }).url()
        audit(url, !allowed(url))
        if (!allowed(url)) return Promise.reject(new Error('Blocked request outside this isolated test run'))
        return original(...args)
      },
    })
  }
}

async function protect(context: BrowserContext) {
  guardApi(context.request)
  await context.route('**/*', async (route) => {
    const url = route.request().url()
    const blocked = !allowed(url)
    audit(url, blocked)
    if (blocked) await route.abort('blockedbyclient')
    else await route.continue()
  })
  return context
}

export async function isolatedContext(browser: Browser) {
  return protect(await browser.newContext({ baseURL: run.uiOrigin }))
}

export const test = base.extend({
  context: async ({ context }, provideContext) => {
    await protect(context)
    for (const endpoint of [run.apiOrigin + '/health', run.uiOrigin + '/__exam_test_run']) {
      const response = await context.request.get(endpoint, { maxRedirects: 0 })
      expect(response.ok()).toBe(true)
      expect(response.headers()['x-exam-test-run']).toBe(run.nonce)
    }
    await provideContext(context)
  },
})
export { expect }
