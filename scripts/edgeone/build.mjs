import { access, cp, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { run } from '../quality/run.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const web = join(root, 'apps/web')
const output = join(web, '.edgeone')
const published = join(root, '.edgeone')

function httpsOrigin(name) {
  let value
  try {
    value = new URL(process.env[name])
  } catch {
    /* Report the setting name only. */
  }
  if (
    !value ||
    value.protocol !== 'https:' ||
    value.username ||
    value.password ||
    value.pathname !== '/' ||
    value.search ||
    value.hash ||
    ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)
  ) {
    throw new Error(`${name} must be a public HTTPS origin without a path, credentials or query.`)
  }
}

httpsOrigin('NUXT_API_BASE')
httpsOrigin('NUXT_PUBLIC_SITE_URL')
if ((process.env.NUXT_API_PROXY_SECRET || '').length < 32) {
  throw new Error('Set NUXT_API_PROXY_SECRET to a random value of at least 32 characters.')
}
await run(process.execPath, [join(root, 'scripts/sync-award-rules.mjs'), '--check'], { cwd: root })
// Validate the fixed absolute target before removing this deployment's old output.
if (resolve(output) !== resolve(web, '.edgeone')) throw new Error('Invalid output directory.')
await rm(output, { recursive: true, force: true })
// The CLI discovers SSR under the project root's .edgeone, regardless of
// outputDirectory. Preserve CLI state and clear only our generated files.
if (resolve(published) !== resolve(root, '.edgeone')) throw new Error('Invalid publish directory.')
for (const name of ['assets', 'cloud-functions/ssr-node']) {
  const target = resolve(published, name)
  const inside = relative(published, target)
  if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Invalid publish target.')
  await rm(target, { recursive: true, force: true })
}
await rm(join(published, 'routes.json'), { force: true })
await run(process.execPath, [join(web, 'node_modules/nuxt/bin/nuxt.mjs'), 'build'], {
  cwd: web,
  env: { ...process.env, CZX_EDGEONE_BUILD: '1', CZX_CHECK: '', NITRO_PRESET: 'node-server' },
})

const require = createRequire(join(web, 'package.json'))
const { onBuild } = await import(pathToFileURL(require.resolve('@edgeone/nuxt-pages')).href)
// Output paths are explicit above, so the adapter never rewrites nuxt.config.ts.
process.chdir(web)
await onBuild({ cwd: web, env: process.env, meta: {}, functions: {}, constants: { PUBLISH_DIR: '.edgeone' } })

const server = join(output, 'cloud-functions/ssr-node')
const generatedHandler = await readFile(join(server, 'handler.js'), 'utf8')
const symbol = generatedHandler.match(/const \{\s*([\w$]+): useNitroApp \}/)?.[1]
if (!symbol) throw new Error('The EdgeOne adapter changed its handler format; inspect before deploying.')
let entry = './chunks/nitro/nitro.mjs'
try {
  await access(join(server, entry))
} catch {
  entry = './chunks/_/nitro.mjs'
  await access(join(server, entry))
}
const template = await readFile(join(root, 'scripts/edgeone/handler.mjs'), 'utf8')
await writeFile(
  join(server, 'handler.js'),
  template.replace('__NITRO_ENTRY__', entry).replace('__NITRO_APP_SYMBOL__', symbol),
)
await rm(join(server, 'index.mjs'), { force: true })

// The upstream adapter can copy dotenv files. Never ship them in an artifact.
async function stripPrivateFiles(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, file.name)
    if (file.name === '.env' || file.name.startsWith('.env.')) {
      if (file.isDirectory()) throw new Error('Unexpected dotenv directory in EdgeOne output.')
      await unlink(path)
    } else if (file.isSymbolicLink()) {
      // Nitro's traced packages can be junctions on Windows. Materialize only
      // targets inside this output so the artifact is portable to Linux.
      const target = await realpath(path)
      const inside = relative(output, target)
      if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('External link in EdgeOne output.')
      await unlink(path)
      await cp(target, path, { recursive: true, dereference: true })
      await stripPrivateFiles(path)
    } else if (file.isDirectory()) await stripPrivateFiles(path)
  }
}
await stripPrivateFiles(output)
await writeFile(join(output, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
await cp(output, published, { recursive: true, dereference: true })
await access(join(published, 'cloud-functions/ssr-node/handler.js'))
await access(join(published, 'cloud-functions/ssr-node/config.json'))
console.log(`EdgeOne artifact ready: ${published}`)
console.log('SSR entry ready: .edgeone/cloud-functions/ssr-node/handler.js')
console.log('Build only: no cloud project was linked and no deployment was published.')
