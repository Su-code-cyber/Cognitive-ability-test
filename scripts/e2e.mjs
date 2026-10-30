import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = path.join(root, '.runtime')
const temp = path.join(runtime, 'tmp')
mkdirSync(temp, { recursive: true })
// Each invocation gets its own DB. Never delete or reuse the development database.
const run = mkdtempSync(path.join(runtime, 'e2e-'))
const install = process.argv.includes('--install')
const args = install ? ['install', 'chromium', '--only-shell'] : ['test', ...process.argv.slice(2)]
const child = spawn(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'), ...args], {
  cwd: root, stdio: 'inherit',
  env: {
    ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, PYTHONDONTWRITEBYTECODE: '1',
    PLAYWRIGHT_BROWSERS_PATH: path.join(runtime, 'browsers'), PLAYWRIGHT_SKIP_BROWSER_GC: '1',
    EXAM_DATABASE_PATH: path.join(run, 'exam.sqlite3'),
  },
})
child.on('error', (error) => { console.error(error); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
