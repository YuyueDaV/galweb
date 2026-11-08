import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
// Nitro and adapter dependencies can retain background timers on Linux even
// after every assertion passes. Bound this standalone CLI, including cleanup.
const deadline = setTimeout(() => {
  console.error('EdgeOne smoke timed out before completing assertions and cleanup.')
  process.exit(1)
}, 60_000)
deadline.unref()
const deployment = JSON.parse(await readFile(join(root, 'edgeone.json'), 'utf8'))
const output = resolve(root, deployment.outputDirectory)
// Match the CLI's fixed SSR discovery path, not only a locally importable file.
assert.equal(output, resolve(root, '.edgeone'), 'Publish the full artifact at the project root')
// The cloud adapter imports Nuxt Kit from the app root, not Nuxt's dependency tree.
const require = createRequire(join(root, 'apps/web/package.json'))
const kit = await import(pathToFileURL(require.resolve('@nuxt/kit')).href)
assert.equal(typeof kit.defineNuxtModule, 'function')
const secret = 'edgeone-smoke-only-gateway-secret-0123456789'
const calls = []
const backend = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  calls.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks) })
  if (req.headers['x-czx-proxy-secret'] !== secret) {
    res.writeHead(403).end(JSON.stringify({ message: 'Gateway credential required.' }))
    return
  }
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')
  if (req.url.startsWith('/api/bangumi/cover?')) {
    res.setHeader('Content-Type', 'image/webp')
    res.end(Buffer.from('public-cover-fixture'))
    return
  }
  if (req.url.startsWith('/api/auth/login')) {
    res.setHeader('Set-Cookie', [
      '__Host-czx_session=smoke-session; Path=/; HttpOnly; Secure; SameSite=Lax',
      'smoke-extra=second; Path=/; Secure',
    ])
    res.end(JSON.stringify({ user: { username: 'smoke' } }))
  } else if (req.url === '/api/smoke-empty') {
    res.writeHead(204).end()
  } else if (req.url === '/api/smoke-error') {
    res.writeHead(422).end(JSON.stringify({ message: '验证码无效。' }))
  } else if (req.url?.startsWith('/api/posts')) {
    res.end(JSON.stringify({ items: [], total: 0 }))
  } else if (req.url === '/api/works' || req.url === '/api/tier-lists') {
    res.end('[]')
  } else {
    res.end(JSON.stringify({ status: 'ok' }))
  }
})
backend.listen(0, '127.0.0.1')
await once(backend, 'listening')
process.env.NUXT_API_BASE = `http://127.0.0.1:${backend.address().port}`
process.env.NUXT_API_PROXY_SECRET = secret
process.env.NUXT_PUBLIC_SITE_URL = 'https://forum.example.com'

try {
  const { default: handler } = await import(
    pathToFileURL(join(output, 'cloud-functions/ssr-node/handler.js')).href
  )
  async function request(url, method = 'GET', body = Buffer.alloc(0), extraHeaders = {}, context = {}) {
    const req = Readable.from(body.length ? [body] : [])
    req.url = url
    req.method = method
    req.headers = { host: 'forum.example.com', ...extraHeaders }
    if (body.length) req.headers['content-length'] = String(body.length)
    return handler(req, undefined, { clientIp: '203.0.113.42', ...context })
  }

  const health = await request('/api/health?probe=1', 'GET', undefined, {
    'x-forwarded-for': '198.51.100.99',
    'x-czx-client-ip': '198.51.100.99',
    'x-czx-proxy-secret': 'visitor-forged-secret',
  })
  assert.equal(health.status, 200)
  assert.equal((await health.json()).status, 'ok')
  assert.equal(calls.at(-1).url, '/api/health?probe=1')
  assert.equal(calls.at(-1).headers['x-forwarded-for'], '203.0.113.42')
  assert.equal(calls.at(-1).headers['x-czx-proxy-secret'], secret)
  assert.match(health.headers.get('cache-control'), /no-store/)
  const cover = await request('/api/bangumi/cover?image=fixture')
  assert.equal(cover.status, 200)
  assert.equal(cover.headers.get('content-type'), 'image/webp')
  assert.match(cover.headers.get('cache-control'), /public, max-age=86400/)
  assert.equal(cover.headers.get('set-cookie'), null)

  const login = await request(
    '/api/auth/login',
    'POST',
    Buffer.from('{"username":"smoke","password":"not-a-real-password"}'),
    {
      'content-type': 'application/json',
      origin: 'https://forum.example.com',
    },
  )
  assert.equal(login.status, 200)
  assert.equal(login.headers.getSetCookie().length, 2)
  assert.match(login.headers.getSetCookie()[0], /HttpOnly; Secure/)
  assert.equal(calls.at(-1).headers.origin, 'https://forum.example.com')
  // No real email service is used: all of these hit the local mock backend.
  await request('/api/auth/registration-code', 'POST', Buffer.from('{}'), {
    'content-type': 'application/json',
    referer: 'https://forum.example.com/account',
  })
  assert.equal(calls.at(-1).headers.origin, 'https://forum.example.com')
  await request('/api/auth/register', 'POST', Buffer.from('{}'), {
    'content-type': 'application/json',
    'x-czx-client': 'web',
  })
  assert.equal(calls.at(-1).headers.origin, 'https://forum.example.com')
  for (const origin of ['https://untrusted.example', 'null']) {
    await request('/api/auth/registration-code', 'POST', Buffer.from('{}'), {
      'content-type': 'application/json',
      origin,
      referer: 'https://forum.example.com/',
      'x-czx-client': 'web',
    })
    assert.equal(calls.at(-1).headers.origin, origin, 'Never launder an untrusted Origin')
  }
  await request('/api/auth/registration-code', 'POST', Buffer.from('{}'), {
    'content-type': 'application/json',
    referer: 'https://untrusted.example/',
    'x-czx-client': 'web',
  })
  assert.equal(calls.at(-1).headers.origin, undefined)

  const multipart = Buffer.concat([
    Buffer.from(
      '--smoke\r\nContent-Disposition: form-data; name="file"; filename="image.webp"\r\nContent-Type: image/webp\r\n\r\n',
    ),
    Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0xff, 0xfe, 0x80, 0x00]),
    Buffer.from('\r\n--smoke--\r\n'),
  ])
  const upload = await request('/api/uploads', 'POST', multipart, {
    'content-type': 'multipart/form-data; boundary=smoke',
    cookie: '__Host-czx_session=smoke-session',
    'x-csrf-token': 'smoke-csrf',
    origin: 'https://forum.example.com',
  })
  assert.equal(upload.status, 200)
  assert.deepEqual(calls.at(-1).body, multipart)
  assert.equal(calls.at(-1).headers.cookie, '__Host-czx_session=smoke-session')
  assert.equal(calls.at(-1).headers['x-csrf-token'], 'smoke-csrf')

  assert.equal(
    (await request('/api/smoke-empty', 'DELETE', undefined, { 'content-type': 'application/json' })).status,
    204,
  )
  assert.equal((await request('/api/health', 'HEAD')).status, 200)
  const error = await request('/api/smoke-error')
  assert.equal(error.status, 422)
  assert.equal((await error.json()).message, '验证码无效。')
  await request(
    '/api/health',
    'GET',
    undefined,
    { 'x-forwarded-for': '198.51.100.99' },
    { clientIp: 'invalid' },
  )
  assert.equal(calls.at(-1).headers['x-forwarded-for'], 'unknown')
  const previousCalls = calls.length
  const tooBig = await request('/api/uploads', 'POST', Buffer.alloc(6 * 1024 * 1024 + 1))
  assert.equal(tooBig.status, 413)
  assert.equal(calls.length, previousCalls)

  const home = await request('/')
  assert.equal(home.status, 200)
  assert.match(home.headers.get('content-type'), /text\/html/)
  assert.match(await home.text(), /<html/)

  const page = await request('/account')
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.match(page.headers.get('cache-control'), /no-store/)
  assert.ok(!(await page.text()).includes(secret), 'Gateway credentials must never appear in HTML.')
  const sitemap = await request('/sitemap.xml')
  assert.equal(sitemap.status, 200)
  assert.match(await sitemap.text(), /https:\/\/forum\.example\.com/)

  async function inspect(directory) {
    for (const file of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, file.name)
      assert.ok(file.name !== '.env' && !file.name.startsWith('.env.'), 'Do not ship dotenv files.')
      if (file.isDirectory()) await inspect(path)
    }
  }
  await inspect(output)
  const config = JSON.parse(await readFile(join(output, 'cloud-functions/ssr-node/config.json'), 'utf8'))
  assert.ok(config.routes.length, 'SSR route metadata must be present.')
  const publicDirs = await readdir(join(output, 'assets'))
  assert.ok(publicDirs.includes('_nuxt') && publicDirs.includes('fonts') && publicDirs.includes('images'))
  const beforeMissingConfig = calls.length
  const missingConfig = await request(
    '/api/health',
    'GET',
    undefined,
    {},
    {
      env: { NUXT_API_PROXY_SECRET: '' },
    },
  )
  assert.equal(missingConfig.status, 503)
  assert.equal(calls.length, beforeMissingConfig)
  process.env.NUXT_API_PROXY_SECRET = secret
  await new Promise((resolve) => backend.close(resolve))
  const unavailable = await request('/api/health')
  assert.equal(unavailable.status, 502)
  console.log(
    'EdgeOne smoke passed: SSR, cookies, binary uploads, CSRF headers, trusted IP, errors, sitemap and artifact layout.',
  )
} finally {
  backend.closeAllConnections()
  backend.close()
}
clearTimeout(deadline)
// All awaited checks and mock-server cleanup above have completed. This CLI
// must not wait indefinitely for third-party runtime maintenance timers.
process.exit(0)
