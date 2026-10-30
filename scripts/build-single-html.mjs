import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetPath = resolve(projectRoot, 'dist', 'question.html')
process.chdir(projectRoot)

const result = await build({
  root: projectRoot,
  mode: 'singlefile',
  base: './',
  build: {
    write: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
})

if (Array.isArray(result) || !('output' in result)) {
  throw new Error('Expected one Vite build output.')
}

const files = new Map(result.output.map(file => [
  file.fileName,
  file.type === 'chunk' ? file.code : String(file.source),
]))
let html = files.get('index.html')
if (!html) throw new Error('Missing index.html in Vite build output.')

const embedded = new Set(['index.html'])
function inlineAsset(url) {
  const filename = url.replace(/^\.\//, '')
  const content = files.get(filename)
  if (content === undefined) throw new Error(`Missing asset: ${url}`)
  embedded.add(filename)
  return content
}

const scripts = []
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>/gi, (_, url) => {
  const code = inlineAsset(url).replace(/<\/script/gi, '<\\/script')
  scripts.push(`<script>${code}</script>`)
  return ''
})
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/gi, (_, url) => {
  const css = inlineAsset(url).replace(/<\/style/gi, '<\\/style')
  return `<style>${css}</style>`
})
// Vite puts module entries in <head>; classic inline scripts need the root first.
html = html.replace('</body>', () => `${scripts.join('\n')}\n  </body>`)

const remaining = [...files.keys()].filter(filename => !embedded.has(filename))
if (remaining.length) throw new Error(`Unembedded output files: ${remaining.join(', ')}`)

await mkdir(dirname(targetPath), { recursive: true })
await writeFile(targetPath, html, 'utf8')
console.log(`Created ${basename(targetPath)} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB): ${targetPath}`)
