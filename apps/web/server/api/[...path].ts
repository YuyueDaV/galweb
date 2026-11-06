import { isIP } from 'node:net'

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
  try {
    return await proxyRequest(event, `${config.apiBase}${event.path}`, { headers })
  } catch {
    throw createError({ statusCode: 502, message: '后端服务暂时不可用，请稍后重试。' })
  }
})
