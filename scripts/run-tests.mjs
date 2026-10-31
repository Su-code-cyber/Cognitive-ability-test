import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createRun, finishRun, freePort, pythonPath, ROOT, saveRun, snapshot, startChild, stopChild, suiteLock, testEnvironment, waitForOwnedServer, writeViteConfig } from './test-env.mjs'

export async function runTests(kind, args = []) {
  if (args.length) throw new Error('Isolation options cannot be overridden; run the documented standard test command without extra arguments')
  const release = suiteLock()
  const children = []
  let run, exitCode = 1, interrupted = false, stopPromise
  const stop = () => {
    stopPromise ??= (async () => {
      for (const handle of [...children].reverse()) await stopChild(handle)
    })()
    return stopPromise
  }
  const onSignal = () => { interrupted = true; stop().catch((error) => console.error(error.message)) }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
  try {
    run = createRun(kind)
    console.log(`隔离测试目录：${run.directory}`)
    snapshot(run, kind === 'e2e')
    const env = testEnvironment(run)
    const add = (name, executable, command, childEnv = env) => {
      const handle = startChild(run, name, executable, command, childEnv)
      children.push(handle)
      return handle
    }
    if (kind === 'api') {
      const handle = add('pytest', pythonPath(), ['-B', '-m', 'pytest', '--basetemp', path.join(run.directory, 'cases'), '-o', `cache_dir=${path.join(run.directory, 'pytest-cache')}`, '--junitxml', path.join(run.directory, 'reports', 'api.xml')])
      exitCode = (await handle.exited).code
    } else if (kind === 'e2e') {
      run.apiPort = await freePort()
      run.uiPort = await freePort()
      while (run.uiPort === run.apiPort) run.uiPort = await freePort()
      run.apiOrigin = `http://127.0.0.1:${run.apiPort}`
      run.uiOrigin = `http://127.0.0.1:${run.uiPort}`
      saveRun(run)
      const apiEnv = { ...env, QUESTION_TIME_LIMIT_SECONDS: '8', ALLOWED_ORIGINS: `${run.uiOrigin},${run.apiOrigin}` }
      const api = add('api-server', pythonPath(), ['-B', '-m', 'uvicorn', 'backend.tests.isolated_server:create_test_app', '--factory', '--host', '127.0.0.1', '--port', String(run.apiPort)], apiEnv)
      await waitForOwnedServer(api, run.apiOrigin + '/health', run)
      const vite = add('vite-server', process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--config', writeViteConfig(run), '--configLoader', 'native', '--clearScreen', 'false'])
      await waitForOwnedServer(vite, run.uiOrigin + '/__exam_test_run', run)
      writeFileSync(path.join(run.directory, 'reports', 'isolation.json'), JSON.stringify({
        testDatabase: run.database, sourceSnapshot: run.source, frontendCache: path.join(run.directory, 'vite-cache'),
        apiOrigin: run.apiOrigin, uiOrigin: run.uiOrigin, serverIdentityVerified: true,
        protectedPortsExcluded: [5173, 8003], workers: 1, browserProfiles: env.TEMP,
        sharedDevelopmentServicesReused: false,
      }, null, 2) + '\n')
      const handle = add('playwright', process.execPath, [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'test', '--config', path.join(ROOT, 'playwright.config.ts'), ...args])
      exitCode = (await handle.exited).code
    } else if (kind === 'install') {
      const handle = add('browser-install', process.execPath, [path.join(ROOT, 'node_modules/@playwright/test/cli.js'), 'install', 'chromium', '--only-shell'])
      exitCode = (await handle.exited).code
    } else {
      throw new Error('Unknown test suite')
    }
    if (interrupted) exitCode = 130
    return exitCode
  } catch (error) {
    exitCode = interrupted ? 130 : 1
    console.error(error.stack)
    if (run) writeFileSync(path.join(run.directory, 'reports', 'runner-error.txt'), String(error.stack) + '\n')
    return exitCode
  } finally {
    let cleanupError
    try {
      await stop()
      if (run) finishRun(run, interrupted ? 'interrupted' : exitCode === 0 ? 'passed' : 'failed', exitCode)
    } catch (error) {
      // Leave the active lock in place: cleaning uncertain child ownership must fail closed.
      console.error(`保留测试锁以防误清理：${error.message}`)
      cleanupError = error
    }
    if (!cleanupError) release()
    process.removeListener('SIGINT', onSignal)
    process.removeListener('SIGTERM', onSignal)
    if (run && existsSync(path.join(run.directory, 'reports'))) console.log(`测试报告：${path.join(run.directory, 'reports')}`)
    if (cleanupError) throw cleanupError
  }
}
