import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, realpathSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const ROOT = realpathSync(moduleRoot)
// Vite ignores **/node_modules/**. Keep snapshots, tsconfig, HTML and caches invisible
// to the running development server's file watcher without changing its configuration.
export const RUNS = path.join(ROOT, '.runtime', 'node_modules', 'test-runs')
const MARKER = 'question-isolated-tests-v1'

function assertInside(parent, target) {
  const relative = path.relative(parent, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe test path: ${target}`)
}

function ensureRuntime() {
  for (const directory of [path.join(ROOT, '.runtime'), path.join(ROOT, '.runtime', 'node_modules'), RUNS]) {
    mkdirSync(directory, { recursive: true })
    if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) throw new Error('Linked test directories are not allowed')
  }
}

export function suiteLock() {
  ensureRuntime()
  const filename = path.join(RUNS, '.suite.lock')
  let descriptor
  try { descriptor = openSync(filename, 'wx') } catch { throw new Error('已有测试或清理正在运行（.runtime/node_modules/test-runs/.suite.lock）；拒绝并发执行。意外中断后请先确认该锁记录的进程已结束。') }
  writeFileSync(descriptor, JSON.stringify({ marker: MARKER, pid: process.pid, startedAt: new Date().toISOString() }))
  return () => { closeSync(descriptor); unlinkSync(filename) }
}

export function createRun(kind) {
  ensureRuntime()
  if (!['api', 'e2e', 'guards', 'install'].includes(kind)) throw new Error('Unknown test kind')
  const directory = mkdtempSync(path.join(RUNS, `${kind}-`))
  const manifest = {
    marker: MARKER, id: path.basename(directory), nonce: randomBytes(16).toString('hex'), kind,
    workspace: ROOT, directory, source: path.join(directory, 'source'),
    database: path.join(directory, 'state', 'exam.sqlite3'),
    status: 'running', pid: process.pid, startedAt: new Date().toISOString(),
    protectedPorts: [5173, 8003],
  }
  for (const name of ['tmp', 'reports', 'state', 'artifacts']) mkdirSync(path.join(directory, name))
  writeFileSync(path.join(directory, '.active.lock'), String(process.pid), { flag: 'wx' })
  saveRun(manifest)
  return manifest
}

export function saveRun(manifest) {
  assertInside(RUNS, manifest.directory)
  writeFileSync(path.join(manifest.directory, 'run.json'), JSON.stringify(manifest, null, 2) + '\n')
}

export function loadRun() {
  if (process.env.EXAM_TEST_MODE !== '1' || !process.env.EXAM_TEST_RUN_DIR) throw new Error('必须通过 npm run test:api 或 npm run test:e2e 启动隔离测试，禁止回退到开发服务。')
  const directory = realpathSync(process.env.EXAM_TEST_RUN_DIR)
  assertInside(RUNS, directory)
  const run = JSON.parse(readFileSync(path.join(directory, 'run.json'), 'utf8'))
  if (run.marker !== MARKER || run.directory !== directory || run.workspace !== ROOT || run.nonce !== process.env.EXAM_TEST_NONCE || run.status !== 'running' || !existsSync(path.join(directory, '.active.lock'))) throw new Error('Invalid or inactive test manifest')
  if (process.env.EXAM_DATABASE_PATH !== run.database) throw new Error('Test database does not match the owned run directory')
  return run
}

export function snapshot(run, browser = false) {
  mkdirSync(run.source)
  const paths = ['backend', 'pytest.ini']
  if (browser) paths.push('src', 'index.html', 'tsconfig.json', 'package.json', 'tests/e2e')
  for (const relative of paths) {
    cpSync(path.join(ROOT, relative), path.join(run.source, relative), {
      recursive: true,
      filter: (file) => !['data', '__pycache__', '.pytest_cache'].includes(path.basename(file)) && !file.endsWith('.pyc'),
    })
  }
  // No .env, user databases, browser profiles, build output or dependency caches are copied.
  const files = {}
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else files[path.relative(run.source, file).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(file)).digest('hex')
    }
  }
  walk(run.source)
  run.sourceHashes = files
  try { run.gitCommit = execFileSync('git', ['-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() } catch { run.gitCommit = null }
  saveRun(run)
}

export function testEnvironment(run) {
  const env = { ...process.env }
  for (const name of Object.keys(env)) {
    if (/^(EXAM_TEST_|VITE_|PYTEST_|PYTHONPATH$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$|NO_PROXY$|PLAYWRIGHT_|PW_TEST_|PWDEBUG$|NODE_OPTIONS$|NODE_V8_COVERAGE$|COVERAGE_FILE$)/i.test(name)) delete env[name]
  }
  return {
    ...env, EXAM_TEST_MODE: '1', EXAM_TEST_RUN_DIR: run.directory, EXAM_TEST_NONCE: run.nonce,
    EXAM_DATABASE_PATH: run.database, COOKIE_SECURE: 'false', QUESTION_TIME_LIMIT_SECONDS: '60',
    ALLOWED_ORIGINS: 'http://testclient.local', PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1', PYTHONPATH: run.source,
    PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
    TEMP: path.join(run.directory, 'tmp'), TMP: path.join(run.directory, 'tmp'), TMPDIR: path.join(run.directory, 'tmp'),
    PLAYWRIGHT_BROWSERS_PATH: path.join(ROOT, '.runtime', 'browsers'), PLAYWRIGHT_SKIP_BROWSER_GC: '1',
  }
}

export function pythonPath() {
  const filename = path.join(ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
  if (!existsSync(filename)) throw new Error('请按 README 安装项目内 .venv 和锁定依赖')
  return filename
}

export function startChild(run, name, executable, args, env) {
  const child = spawn(executable, args, { cwd: run.source, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true })
  const log = openSync(path.join(run.directory, 'reports', `${name}.log`), 'a')
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    writeFileSync(log, chunk)
    process.stdout.write(chunk)
  })
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => { closeSync(log); resolve({ code: code ?? 1, signal }) })
  })
  child.once('spawn', () => {
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL) } catch { /* resource scheduling is platform dependent */ }
  })
  return { child, exited, name }
}

export async function stopChild(handle) {
  if (!handle || handle.child.exitCode !== null || handle.child.signalCode !== null || !handle.child.pid) return
  if (process.platform === 'win32') {
    // Only a PID returned by this runner's spawn is accepted; never kill by image name or port.
    try { execFileSync('taskkill', ['/PID', String(handle.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) } catch { /* already exited */ }
  } else {
    try { process.kill(-handle.child.pid, 'SIGTERM') } catch { /* already exited */ }
  }
  let timer
  try {
    await Promise.race([handle.exited.catch(() => {}), new Promise((resolve) => { timer = setTimeout(resolve, 5000) })])
  } finally { clearTimeout(timer) }
  if (handle.child.exitCode === null && handle.child.signalCode === null) throw new Error(`Test child did not exit: ${handle.name}`)
}

export async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  if ([5173, 8003].includes(port)) return freePort()
  return port
}

export async function waitForOwnedServer(handle, url, run) {
  const deadline = Date.now() + 40_000
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) throw new Error(`${handle.name} exited before readiness`)
    try {
      const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(1500) })
      if (response.ok) {
        if (response.headers.get('x-exam-test-run') !== run.nonce) throw new Error(`UNOWNED_SERVER: ${url}`)
        return
      }
    } catch (error) {
      if (error.message.startsWith('UNOWNED_SERVER:')) throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out waiting for isolated ${handle.name}`)
}

export function writeViteConfig(run) {
  const require = createRequire(path.join(ROOT, 'package.json'))
  const imports = (name) => JSON.stringify(pathToFileURL(require.resolve(name)).href)
  const config = path.join(run.directory, 'vite.test.config.mjs')
  writeFileSync(config, `import react from ${imports('@vitejs/plugin-react')};
import tailwindcss from ${imports('@tailwindcss/vite')};
export default {
  root: ${JSON.stringify(run.source)}, envDir: ${JSON.stringify(path.join(run.directory, 'empty-env'))},
  cacheDir: ${JSON.stringify(path.join(run.directory, 'vite-cache'))},
  plugins: [react(), tailwindcss(), {name:'isolated-test-identity', configureServer(server) {
    server.middlewares.use('/__exam_test_run', (_req,res) => {res.setHeader('X-Exam-Test-Run',${JSON.stringify(run.nonce)});res.end('isolated');});
  }}],
  resolve: {alias:{'@':${JSON.stringify(path.join(run.source, 'src'))}}},
  server: {host:'127.0.0.1',port:${run.uiPort},strictPort:true,
    fs:{allow:[${JSON.stringify(run.source)},${JSON.stringify(path.join(ROOT, 'node_modules'))},${JSON.stringify(path.join(run.directory, 'vite-cache'))}]},
    proxy:{'/api/blue':{target:${JSON.stringify(run.apiOrigin)},changeOrigin:true}}}
};\n`)
  return config
}

export function finishRun(run, status, code) {
  run.status = status
  run.exitCode = code
  run.finishedAt = new Date().toISOString()
  saveRun(run)
  unlinkSync(path.join(run.directory, '.active.lock'))
  writeFileSync(path.join(ROOT, '.runtime', `latest-${run.kind}.json`), JSON.stringify({ id: run.id, directory: run.directory, status, exitCode: code }, null, 2) + '\n')
}

export function cleanableRun(directory) {
  try {
    assertInside(RUNS, directory)
    if (path.dirname(directory) !== RUNS || lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory || existsSync(path.join(directory, '.active.lock'))) return false
    const run = JSON.parse(readFileSync(path.join(directory, 'run.json'), 'utf8'))
    return run.marker === MARKER && run.directory === directory && run.workspace === ROOT && ['passed', 'failed', 'interrupted'].includes(run.status)
  } catch { return false }
}

export function removeFinishedRun(directory) {
  if (!cleanableRun(directory)) throw new Error('Refusing to remove active, unowned or linked test data')
  rmSync(directory, { recursive: true, force: true })
}
