import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
const runtime = path.join(root, '.runtime')
if (existsSync(runtime)) {
  if (realpathSync(runtime) !== runtime) throw new Error('Refusing to clean a linked runtime directory')
  for (const entry of readdirSync(runtime, { withFileTypes: true })) {
    if (!/^(pytest-|e2e-|playwright-results$|playwright-report$|backend-results\.xml$|browser-results\.xml$)/.test(entry.name)) continue
    const target = path.join(runtime, entry.name)
    const resolved = realpathSync(target)
    if (!resolved.startsWith(root + path.sep) || entry.isSymbolicLink()) throw new Error('Refusing to clean a path outside the project')
    rmSync(target, { recursive: true, force: true })
    console.log(`Removed ${path.relative(root, target)}`)
  }
}
