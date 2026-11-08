import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../', import.meta.url))
const tag = process.argv[2]
if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) throw new Error('Usage: pnpm release:pack v0.1.0')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const commit = git('rev-parse', '--verify', `${tag}^{commit}`)
const files = git('ls-tree', '-r', '--name-only', commit).split('\n')
const forbidden = files.filter(
  (file) =>
    /(^|\/)(?:\.env(?:\..*)?|node_modules|\.data|\.edgeone|\.output|\.git)(?:\/|$)/.test(file) &&
    !file.endsWith('/.env.example'),
)
if (forbidden.length) throw new Error('Private or generated files are tracked: ' + forbidden.join(', '))
const output = path.join(root, '.data', 'releases', tag)
await mkdir(output, { recursive: true })
const base = `galweb-${tag}`
const assets = [`${base}-source.zip`, `${base}-source.tar.gz`]
for (const [index, format] of ['zip', 'tar.gz'].entries()) {
  git(
    'archive',
    `--format=${format}`,
    `--prefix=${base}/`,
    `--output=${path.join(output, assets[index])}`,
    commit,
  )
}
await writeFile(
  path.join(output, 'RELEASE-NOTES.md'),
  git('show', `${commit}:docs/releases/${tag}.md`) + '\n',
)
assets.push('RELEASE-NOTES.md')
const sums = []
for (const name of assets) {
  const bytes = await readFile(path.join(output, name))
  sums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)
  console.log(`${name}: ${bytes.length} bytes`)
}
await writeFile(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n')
console.log(`Packaged ${tag} (${commit}) at ${output}`)
