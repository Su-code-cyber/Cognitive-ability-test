import { readdirSync } from 'node:fs'
import path from 'node:path'
import { cleanableRun, removeFinishedRun, RUNS, suiteLock } from './test-env.mjs'

const requested = process.argv.slice(2)
if (requested.length && (requested.length !== 2 || requested[0] !== '--run' || !/^(api|e2e|guards|install)-[A-Za-z0-9_-]+$/.test(requested[1]))) throw new Error('Usage: npm run test:clean [-- --run RUN_ID]')
const release = suiteLock()
try {
  for (const entry of readdirSync(RUNS, { withFileTypes: true })) {
    if (!entry.isDirectory() || (requested.length && entry.name !== requested[1])) continue
    const target = path.join(RUNS, entry.name)
    if (!cleanableRun(target)) {
      console.log(`保留未结束或不属于本工具的目录：${entry.name}`)
      continue
    }
    removeFinishedRun(target)
    console.log(`Removed ${target}`)
  }
} finally {
  release()
}
