import { isIP } from 'node:net'
import { verifiedRequestOrigin } from '~/utils/request-origin'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const headers: Record<string, string> = {}
  if (config.edgeone) {
    // The generated EdgeOne handler replaces this header using context.clientIp.
    const clientIp = getRequestHeader(event, 'x-czx-client-ip') || ''
    headers['x-forwarded-for'] = isIP(clientIp) ? clientIp : 'unknown'
    if (config.apiProxySecret.length < 32) {
      throw createError({ statusCode: 503, message: '网站接口尚未配置完成。' })
    }
    headers['x-czx-proxy-secret'] = config.apiProxySecret
  } else {
    headers['x-forwarded-for'] =
      getRequestIP(event, {
        xForwardedFor: process.env.NUXT_TRUST_PROXY === 'true',
      }) || 'unknown'
    // Do not pass a visitor-supplied gateway credential through other deployments.
    headers['x-czx-proxy-secret'] = ''
  }
  // Repair missing Origin only after validating same-origin browser evidence.
  // Never replace a foreign or opaque Origin with the configured site URL.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    const incoming = getRequestHeader(event, 'origin')
    if (incoming === undefined) {
      const origin = verifiedRequestOrigin(
        {
          referer: getRequestHeader(event, 'referer'),
          fetchSite: getRequestHeader(event, 'sec-fetch-site'),
          client: getRequestHeader(event, 'x-czx-client'),
        },
        config.public.siteUrl,
      )
      if (origin) headers.origin = origin
    }
  }
  try {
    return await proxyRequest(event, `${config.apiBase}${event.path}`, { headers })
  } catch {
    throw createError({ statusCode: 502, message: '后端服务暂时不可用，请稍后重试。' })
  }
})
