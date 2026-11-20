import { createHash } from 'node:crypto'
import { HttpException } from '@nestjs/common'
import type { Config } from './config'

export const oauthProviders = ['qq', 'discord', 'qq-xinyue'] as const
export type OAuthProvider = (typeof oauthProviders)[number]
export type OAuthProfile = { subject: string; name: string }
const labels: Record<OAuthProvider, string> = { qq: 'QQ', discord: 'Discord', 'qq-xinyue': 'QQ（心月测试）' }
export const oauthLabel = (provider: OAuthProvider) => labels[provider]
const xinyueOrigin = 'https://qq.wch666.com'
const failure = () => new HttpException('第三方授权未能完成，请重新尝试。', 502)

export function decodeQqResponse(body: string): Record<string, unknown> {
  const trimmed = body.replace(/^\uFEFF/, '').trim()
  const wrapped = trimmed.match(/^callback\s*\(\s*([\s\S]*)\s*\)\s*;?$/)
  try {
    const result = JSON.parse(wrapped ? wrapped[1]! : trimmed)
    if (result && typeof result === 'object' && !Array.isArray(result)) return result
  } catch {
    /* QQ also returns form-encoded access tokens. */
  }
  if (!trimmed.includes('=')) throw failure()
  return Object.fromEntries(new URLSearchParams(trimmed))
}

export class OAuthProviders {
  constructor(
    private config: Config,
    private fetcher: typeof fetch = fetch,
  ) {}
  private credentials(provider: 'qq' | 'discord') {
    return provider === 'qq'
      ? { id: this.config.QQ_CLIENT_ID, secret: this.config.QQ_CLIENT_SECRET }
      : { id: this.config.DISCORD_CLIENT_ID, secret: this.config.DISCORD_CLIENT_SECRET }
  }
  enabled(provider: OAuthProvider) {
    if (provider === 'qq-xinyue')
      return this.config.NODE_ENV !== 'production' && !!this.config.QQ_XINYUE_TOKEN
    const { id, secret } = this.credentials(provider)
    return !!id && !!secret
  }
  callback(provider: OAuthProvider) {
    return this.config.WEB_ORIGIN + '/api/auth/oauth/' + provider + '/callback'
  }
  authorize(provider: OAuthProvider, state: string, verifier: string) {
    if (!this.enabled(provider)) throw new HttpException('该登录方式暂未开放。', 503)
    if (provider === 'qq-xinyue') {
      const query = new URLSearchParams({ token: this.config.QQ_XINYUE_TOKEN, msg: state })
      return `${xinyueOrigin}/api/qq.php?${query}`
    }
    const url = new URL(
      provider === 'qq' ? 'https://graph.qq.com/oauth2.0/authorize' : 'https://discord.com/oauth2/authorize',
    )
    url.search = new URLSearchParams({
      client_id: this.credentials(provider).id,
      redirect_uri: this.callback(provider),
      response_type: 'code',
      state,
      scope: provider === 'qq' ? 'get_user_info' : 'identify',
      ...(provider === 'discord'
        ? {
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256',
          }
        : {}),
    }).toString()
    return url.toString()
  }
  private async request(url: string, options: RequestInit = {}, qq = false) {
    try {
      const response = await this.fetcher(url, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: { Accept: 'application/json', ...options.headers },
      })
      if (!response.ok) throw failure()
      const body = await response.text()
      if (body.length > 65536) throw failure()
      const result = qq ? decodeQqResponse(body) : JSON.parse(body)
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw failure()
      return result as Record<string, unknown>
    } catch {
      throw failure()
    }
  }
  async profile(provider: OAuthProvider, code: string, verifier: string): Promise<OAuthProfile> {
    if (!this.enabled(provider)) throw new HttpException('该登录方式暂未开放。', 503)
    if (provider === 'qq-xinyue') {
      const query = new URLSearchParams({ code })
      const info = await this.request(`${xinyueOrigin}/api/get_user_info.php?${query}`, {}, true)
      const subject = info.open_id ?? info.openid
      if (info.error || typeof subject !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(subject))
        throw failure()
      const nickname = typeof info.nickname === 'string' ? info.nickname : ''
      return { subject, name: Array.from(nickname.trim()).slice(0, 24).join('') || 'QQ 同好' }
    }
    const { id, secret } = this.credentials(provider)
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: this.callback(provider),
    })
    if (provider === 'qq') {
      params.set('fmt', 'json')
      const access = await this.request('https://graph.qq.com/oauth2.0/token?' + params, {}, true)
      if (
        typeof access.access_token !== 'string' ||
        !access.access_token ||
        access.access_token.length > 4096
      )
        throw failure()
      const who = await this.request(
        'https://graph.qq.com/oauth2.0/me?' +
          new URLSearchParams({ access_token: access.access_token, fmt: 'json' }),
        {},
        true,
      )
      if (
        String(who.client_id) !== id ||
        typeof who.openid !== 'string' ||
        !/^[a-fA-F0-9]{32}$/.test(who.openid)
      )
        throw failure()
      const info = await this.request(
        'https://graph.qq.com/user/get_user_info?' +
          new URLSearchParams({
            access_token: access.access_token,
            oauth_consumer_key: id,
            openid: who.openid,
            fmt: 'json',
          }),
        {},
        true,
      )
      if (Number(info.ret) !== 0 || typeof info.nickname !== 'string') throw failure()
      return {
        subject: who.openid.toUpperCase(),
        name: Array.from(info.nickname.trim()).slice(0, 24).join('') || 'QQ 同好',
      }
    }
    params.set('code_verifier', verifier)
    const access = await this.request('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (typeof access.access_token !== 'string' || !access.access_token || access.access_token.length > 4096)
      throw failure()
    const who = await this.request('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + access.access_token },
    })
    if (typeof who.id !== 'string' || !/^\d{1,25}$/.test(who.id)) throw failure()
    const name =
      typeof who.global_name === 'string'
        ? who.global_name
        : typeof who.username === 'string'
          ? who.username
          : 'Discord 同好'
    return { subject: who.id, name: Array.from(name.trim()).slice(0, 24).join('') || 'Discord 同好' }
  }
}
