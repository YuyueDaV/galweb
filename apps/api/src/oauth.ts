import { randomUUID } from 'node:crypto'
import type { Config } from './config'
import { Database } from './database'
import { Auth } from './auth'
import { Platform, reject } from './platform'
import { digest, equal, token } from './security'
import { usernameKey } from './identity'
import { OAuthProviders, oauthProviders, oauthLabel, type OAuthProvider } from './oauth-providers'

type Flow = {
  state_hash: string
  browser_hash: string
  provider: OAuthProvider
  mode: 'login' | 'bind'
  user_id: string | null
  session_hash: string | null
  return_path: string
  verifier: string
  expires_at: number
}
type User = {
  id: string
  nickname: string
  status: string
  role: string
  password_hash: string
  email_verified_at: number
  email: string | null
}
export function oauthReturnPath(value: string, origin: string) {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)
  )
    throw reject('返回页面不正确。', 422)
  const url = new URL(value, origin)
  if (url.origin !== origin || url.pathname.startsWith('/api/')) throw reject('返回页面不正确。', 422)
  return url.pathname + url.search + url.hash
}

export class OAuth {
  constructor(
    readonly db: Database,
    readonly auth: Auth,
    readonly platform: Platform,
    readonly config: Config,
    readonly providers = new OAuthProviders(config),
  ) {}
  options() {
    return oauthProviders.map((provider) => ({
      provider,
      label: oauthLabel(provider),
      enabled: this.providers.enabled(provider),
    }))
  }
  async start(provider: OAuthProvider, mode: 'login' | 'bind', returnTo: string, rawSession?: string) {
    if (!this.providers.enabled(provider)) throw reject('该登录方式暂未开放。', 503)
    const user = mode === 'bind' ? await this.auth.session(rawSession) : null
    const state = token(),
      browser = token(),
      verifier = token() + token()
    const path = oauthReturnPath(returnTo, this.config.WEB_ORIGIN)
    await this.db.execute('DELETE FROM oauth_flows WHERE expires_at<=?', [Date.now()])
    await this.db.execute(
      'INSERT INTO oauth_flows(state_hash,browser_hash,provider,mode,user_id,session_hash,return_path,verifier,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        digest(state),
        digest(browser),
        provider,
        mode,
        user?.id || null,
        user ? digest(rawSession!) : null,
        path,
        verifier,
        Date.now() + 600000,
      ],
    )
    return { url: this.providers.authorize(provider, state, verifier), browser }
  }
  private async consume(provider: OAuthProvider, state: string, browser: string) {
    if (!/^[\w-]{43}$/.test(state) || !/^[\w-]{43}$/.test(browser))
      throw reject('授权状态无效，请重新开始。', 422)
    return this.db.transaction(async (tx) => {
      const flow = (
        await this.db.rows<Flow>(
          'SELECT * FROM oauth_flows WHERE state_hash=? FOR UPDATE',
          [digest(state)],
          tx,
        )
      )[0]
      if (
        !flow ||
        flow.provider !== provider ||
        !equal(flow.browser_hash, digest(browser)) ||
        Number(flow.expires_at) <= Date.now()
      )
        throw reject('授权已过期或不属于当前浏览器，请重新开始。', 422)
      await this.db.execute('DELETE FROM oauth_flows WHERE state_hash=?', [flow.state_hash], tx)
      return flow
    })
  }
  async callback(
    provider: OAuthProvider,
    input: { state: string; code?: string; error?: string; iss?: string },
    browser: string,
    rawSession?: string,
  ) {
    const flow = await this.consume(provider, input.state, browser)
    try {
      if (input.error || !input.code) throw reject('已取消授权，未更改账号。', 422)
      if (provider === 'discord' && input.iss && input.iss !== 'https://discord.com')
        throw reject('授权来源不正确。', 422)
      const profile = await this.providers.profile(provider, input.code, flow.verifier)
      const result = await this.db.transaction(async (tx) => {
        await this.platform.lock('auth-identities', tx)
        if (flow.mode === 'bind') {
          if (!rawSession || !flow.session_hash || !equal(digest(rawSession), flow.session_hash))
            throw reject('登录状态已变化，请重新登录后绑定。', 401)
          const session = await this.auth.session(rawSession)
          if (session.id !== flow.user_id) throw reject('绑定账号已变化，请重新开始。', 401)
          const user = await this.platform.actor(session.id, tx)
          // The user lock also serializes account disabling and deletion.
          const valid = await this.db.rows(
            'SELECT token_hash FROM auth_sessions WHERE token_hash=? AND user_id=? AND expires_at>? FOR UPDATE',
            [flow.session_hash, user.id, Date.now()],
            tx,
          )
          if (!valid.length) throw reject('登录已过期，请重新登录后绑定。', 401)
          const owned = (
            await this.db.rows<{ user_id: string }>(
              'SELECT user_id FROM oauth_identities WHERE provider=? AND subject=?',
              [provider, profile.subject],
              tx,
            )
          )[0]
          if (owned && owned.user_id !== user.id)
            throw reject('该第三方账号已绑定其他账号，请先在原账号中解绑。', 409)
          const current = (
            await this.db.rows<{ subject: string }>(
              'SELECT subject FROM oauth_identities WHERE provider=? AND user_id=?',
              [provider, user.id],
              tx,
            )
          )[0]
          if (current && current.subject !== profile.subject)
            throw reject('当前账号已绑定另一个同类账号，请先解绑。', 409)
          if (!owned)
            await this.db.execute(
              'INSERT INTO oauth_identities(provider,subject,user_id,display_name,created_at) VALUES (?,?,?,?,?)',
              [provider, profile.subject, user.id, profile.name, Date.now()],
              tx,
            )
          await this.platform.audit(user, '绑定 ' + oauthLabel(provider) + ' 登录身份', null, tx)
          return { mode: 'bind' as const, returnTo: flow.return_path }
        }
        const owned = (
          await this.db.rows<{ user_id: string }>(
            'SELECT user_id FROM oauth_identities WHERE provider=? AND subject=?',
            [provider, profile.subject],
            tx,
          )
        )[0]
        let userId = owned?.user_id
        if (!userId) {
          userId = randomUUID()
          const username = (provider + '_' + userId.replaceAll('-', '')).slice(0, 24)
          await this.db.execute(
            "INSERT INTO users(id,email,email_key,username,username_key,nickname,password_hash,email_verified_at,created_at) VALUES (?,NULL,NULL,?,?,?,'',0,?)",
            [userId, username, usernameKey(username), profile.name, Date.now()],
            tx,
          )
          await this.db.execute(
            'INSERT INTO oauth_identities(provider,subject,user_id,display_name,created_at) VALUES (?,?,?,?,?)',
            [provider, profile.subject, userId, profile.name, Date.now()],
            tx,
          )
        }
        const session = await this.auth.issueSession(userId, rawSession, tx)
        await this.platform.audit(
          { id: userId, nickname: session.user.nickname, role: session.user.role, status: 'active' },
          oauthLabel(provider) + ' 授权登录',
          null,
          tx,
        )
        return { mode: 'login' as const, returnTo: flow.return_path, session }
      })
      return result
    } catch (error) {
      if (error instanceof Error) Object.assign(error, { oauthReturnTo: flow.return_path })
      throw error
    }
  }
  async bindings(userId: string) {
    const rows = await this.db.rows<{ provider: OAuthProvider; display_name: string; created_at: number }>(
      'SELECT provider,display_name,created_at FROM oauth_identities WHERE user_id=?',
      [userId],
    )
    return this.options().map((option) => {
      const row = rows.find((row) => row.provider === option.provider)
      return {
        ...option,
        bound: !!row,
        displayName: row?.display_name || '',
        boundAt: row ? Number(row.created_at) : null,
      }
    })
  }
  async unlink(userId: string, provider: OAuthProvider, rawSession: string) {
    return this.db.transaction(async (tx) => {
      await this.platform.lock('auth-identities', tx)
      const user = (
        await this.db.rows<User>(
          'SELECT id,nickname,status,role,password_hash,email,email_verified_at FROM users WHERE id=? FOR UPDATE',
          [userId],
          tx,
        )
      )[0]
      if (!user || user.status !== 'active') throw reject('账号不可用。', 403)
      if (
        !(
          await this.db.rows(
            'SELECT token_hash FROM auth_sessions WHERE token_hash=? AND user_id=? AND expires_at>? FOR UPDATE',
            [digest(rawSession), userId, Date.now()],
            tx,
          )
        ).length
      )
        throw reject('请重新登录后操作。', 401)
      const rows = await this.db.rows<{ provider: OAuthProvider }>(
        'SELECT provider FROM oauth_identities WHERE user_id=?',
        [userId],
        tx,
      )
      if (!rows.some((row) => row.provider === provider)) return { message: '该登录方式尚未绑定。' }
      const alternative = rows.some(
        (row) => row.provider !== provider && this.providers.enabled(row.provider),
      )
      if (!user.password_hash && !(user.email && Number(user.email_verified_at) > 0) && !alternative)
        throw reject('请先设置邮箱和密码，或绑定另一种登录方式，再解绑。', 409)
      await this.db.execute(
        'DELETE FROM oauth_identities WHERE user_id=? AND provider=?',
        [userId, provider],
        tx,
      )
      await this.db.execute('DELETE FROM oauth_flows WHERE user_id=?', [userId], tx)
      await this.platform.audit(user, '解绑 ' + oauthLabel(provider) + ' 登录身份', null, tx)
      return { message: oauthLabel(provider) + ' 已解绑。' }
    })
  }
}
