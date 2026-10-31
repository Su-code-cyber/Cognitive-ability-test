import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = path.join(root, '.runtime')
const temp = path.join(runtime, 'tmp')
mkdirSync(temp, { recursive: true })
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python)) throw new Error('请先按 README 在项目目录创建 .venv 并安装 backend/requirements.lock.txt')
const mode = process.argv[2]
const commands = {
  serve: ['-m', 'uvicorn', 'backend.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '8003'],
  init: ['-m', 'backend.db'],
  results: ['-m', 'backend.inspect_results', ...process.argv.slice(3)],
  test: ['-m', 'pytest', '--basetemp', mode === 'test' ? mkdtempSync(path.join(runtime, 'pytest-')) : '', '--junitxml', path.join(runtime, 'backend-results.xml')],
  e2e: ['-m', 'uvicorn', 'backend.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '18003'],
}
if (!commands[mode]) throw new Error('Unknown backend command')
const child = spawn(python, ['-B', ...commands[mode]], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
})
child.on('error', (error) => { console.error(error); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
