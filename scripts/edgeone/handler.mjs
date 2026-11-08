import { isIP } from 'node:net'

// Injected by build.mjs after the pinned adapter generates the Nitro entry.
const NITRO_ENTRY = '__NITRO_ENTRY__'

const MAX_BODY_BYTES = 6 * 1024 * 1024
let nitroApp

export default async function handler(req, _res, context = {}) {
  // Functions can supply variables via context.env. Never read them from a request.
  for (const name of ['NUXT_API_BASE', 'NUXT_PUBLIC_SITE_URL', 'NUXT_API_PROXY_SECRET']) {
    if (typeof context.env?.[name] === 'string') process.env[name] = context.env[name]
  }
  const headers = new Headers(req.headers)
  headers.delete('x-czx-client-ip')
  headers.delete('x-czx-proxy-secret')
  headers.delete('x-forwarded-for')
  headers.set('x-czx-client-ip', isIP(context.clientIp || '') ? context.clientIp : 'unknown')

  const method = (req.method || 'GET').toUpperCase()
  let body
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks = []
    let length = 0
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      length += bytes.length
      if (length > MAX_BODY_BYTES) {
        return Response.json(
          { message: '请求内容过大，图片请控制在 5 MB 以内。' },
          {
            status: 413,
            headers: { 'cache-control': 'no-store' },
          },
        )
      }
      chunks.push(bytes)
    }
    // Multipart uploads must stay binary; converting to UTF-8 corrupts image data.
    body = Buffer.concat(chunks)
  }

  try {
    // Nitro's usual Node entry sets this before loading SSR chunks. The function
    // entry replaces that server, so it must provide a real file URL as well.
    globalThis._importMeta_ ||= { url: new URL(NITRO_ENTRY, import.meta.url).href, env: process.env }
    nitroApp ||= (await import(NITRO_ENTRY)).__NITRO_APP_SYMBOL__()
    const response = await nitroApp.localCall({ url: req.url || '/', method, headers, body })
    const responseHeaders = new Headers()
    if (response.headers instanceof Headers) {
      for (const [name, value] of response.headers) {
        if (name.toLowerCase() !== 'set-cookie') responseHeaders.append(name, value)
      }
      for (const cookie of response.headers.getSetCookie()) responseHeaders.append('set-cookie', cookie)
    } else {
      for (const [name, value] of Object.entries(response.headers || {})) {
        if (value === undefined) continue
        if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item))
        else responseHeaders.set(name, String(value))
      }
    }
    // Keep SSR and account data private; only validated public cover images may be cached.
    const status = response.status || response.statusCode || 200
    const publicCover =
      ['GET', 'HEAD'].includes(method) &&
      /^\/api\/bangumi\/cover(?:\?|$)/.test(req.url || '') &&
      status === 200 &&
      responseHeaders.get('content-type') === 'image/webp' &&
      !responseHeaders.has('set-cookie')
    responseHeaders.set(
      'cache-control',
      publicCover ? 'public, max-age=86400, s-maxage=86400' : 'private, no-store',
    )
    return new Response(method === 'HEAD' || [204, 205, 304].includes(status) ? null : response.body, {
      status,
      headers: responseHeaders,
    })
  } catch {
    return Response.json(
      { message: '网站服务暂时不可用，请稍后重试。' },
      {
        status: 502,
        headers: { 'cache-control': 'no-store' },
      },
    )
  }
}
