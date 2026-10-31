import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './test-env.mjs'
import { runTests } from './run-tests.mjs'

const validation = { startedAt: new Date().toISOString(), suites: [], passed: false }
try {
  for (const kind of ['api', 'e2e']) {
    const exitCode = await runTests(kind)
    const latest = JSON.parse(readFileSync(path.join(ROOT, '.runtime', `latest-${kind}.json`), 'utf8'))
    validation.suites.push({ kind, ...latest })
    if (exitCode !== 0) { process.exitCode = exitCode; break }
  }
  validation.passed = validation.suites.length === 2 && validation.suites.every((suite) => suite.exitCode === 0)
} catch (error) {
  validation.error = error.message
  process.exitCode = 1
} finally {
  validation.finishedAt = new Date().toISOString()
  writeFileSync(path.join(ROOT, '.runtime', 'latest-validation.json'), JSON.stringify(validation, null, 2) + '\n')
  console.log(`加分题1验收：${validation.passed ? '全部通过' : '未全部通过'}。记录：.runtime/latest-validation.json`)
}
