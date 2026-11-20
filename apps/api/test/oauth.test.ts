import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Auth } from '../src/auth'
import { Platform } from '../src/platform'
import { Mailer } from '../src/mail'
import { OAuth } from '../src/oauth'
import { OAuthProviders, type OAuthProvider } from '../src/oauth-providers'
import { oauthControllers } from '../src/oauth-api'
import { digest, token } from '../src/security'
import { AccountDeletion } from '../src/account-deletion'

test(
  'OAuth HTTP：自动建号、同号登录、绑定冲突、CSRF、补邮箱密码、解绑和注销',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = {
      ...readConfig(),
      QQ_CLIENT_ID: '123',
      QQ_CLIENT_SECRET: 'fixture',
      QQ_XINYUE_TOKEN: 'fixture-test-registration',
      DISCORD_CLIENT_ID: '456',
      DISCORD_CLIENT_SECRET: 'fixture',
      WEB_ORIGIN: 'https://oauth.example.test',
    }
    assert.match(config.DB_NAME, /_test$/)
    assert.equal(config.MAIL_TRANSPORT, 'capture')
    const db = new Database(config),
      auth = new Auth(db, config, new Mailer(config)),
      platform = new Platform(db)
    const ids = new Set<string>(),
      states: string[] = [],
      prefix = randomUUID()
    class FakeProviders extends OAuthProviders {
      override async profile(provider: OAuthProvider, code: string) {
        const namespace = provider === 'qq-xinyue' ? 'qq' : provider
        return { subject: prefix + '-' + namespace + '-' + code, name: '授权同好' }
      }
    }
    const oauth = new OAuth(db, auth, platform, config, new FakeProviders(config))
    @Module({ controllers: oauthControllers(db, auth, platform, 'czx_session', config, oauth) })
    class FixtureModule {}
    const app = await NestFactory.create(FixtureModule, { logger: false })
    try {
      await auth.initialize()
      await app.listen(0, '127.0.0.1')
      const base = await app.getUrl()
      const request = (
        path: string,
        method = 'GET',
        body?: unknown,
        session?: { session: string; csrf: string },
        csrf = true,
      ) =>
        fetch(base + '/api/auth/' + path, {
          method,
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            ...(session
              ? {
                  Cookie: 'czx_session=' + session.session,
                  ...(csrf ? { 'X-CSRF-Token': session.csrf } : {}),
                }
              : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
      const start = async (
        provider: OAuthProvider,
        mode: 'login' | 'bind',
        session?: { session: string; csrf: string },
      ) => {
        const response = await request(
          `oauth/${provider}/start`,
          'POST',
          { mode, returnTo: '/awards?tab=mine' },
          session,
        )
        assert.equal(response.status, 201)
        const data = (await response.json()) as { url: string },
          state = new URL(data.url).searchParams.get(provider === 'qq-xinyue' ? 'msg' : 'state')!
        states.push(digest(state))
        const cookie = response.headers.getSetCookie()[0]!
        assert.match(cookie, /HttpOnly/)
        assert.match(cookie, /SameSite=Lax/)
        assert.ok(cookie.startsWith(provider === 'qq-xinyue' ? 'czx_oauth_xinyue=' : 'czx_oauth='))
        return { state, cookie: cookie.split(';')[0]! }
      }
      const callback = async (
        provider: OAuthProvider,
        flow: { state: string; cookie: string },
        code: string,
        session?: { session: string },
        stateParam = provider === 'qq-xinyue' ? 'msg' : 'state',
      ) => {
        const response = await fetch(
          base +
            `/api/auth/oauth/${provider}/callback?` +
            new URLSearchParams({ [stateParam]: flow.state, code }),
          {
            redirect: 'manual',
            headers: { Cookie: flow.cookie + (session ? '; czx_session=' + session.session : '') },
          },
        )
        assert.equal(response.status, 303)
        assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
        assert.match(response.headers.getSetCookie().at(-1)!, /1970/)
        const url = new URL(response.headers.get('location')!)
        assert.equal(url.origin, config.WEB_ORIGIN)
        return { response, url }
      }
      const login = async (provider: OAuthProvider, code: string) => {
        const result = await callback(provider, await start(provider, 'login'), code)
        assert.equal(result.url.searchParams.get('oauth'), 'login')
        assert.equal(result.url.pathname, '/awards')
        assert.equal(result.url.searchParams.get('tab'), 'mine')
        const raw = result.response.headers
          .getSetCookie()
          .find((cookie) => cookie.startsWith('czx_session='))!
          .split(';')[0]!
          .slice('czx_session='.length)
        const bootstrap = await auth.bootstrap(raw)
        ids.add(bootstrap.user.id)
        return { session: raw, csrf: bootstrap.csrfToken!, user: bootstrap.user }
      }
      assert.deepEqual(
        ((await (await request('oauth/providers')).json()) as { enabled: boolean }[]).map(
          (row) => row.enabled,
        ),
        [true, true, true],
      )
      assert.equal((await request('oauth/bindings')).status, 401)
      const a = await login('qq', 'A'),
        otherDevice = await login('qq', 'A'),
        b = await login('qq', 'B')
      assert.equal(a.user.id, otherDevice.user.id)
      assert.notEqual(a.user.id, b.user.id)
      assert.equal(a.user.email, null)
      assert.equal(a.user.hasPassword, false)
      assert.match(a.user.username, /^qq_/)
      const xinyue = await start('qq-xinyue', 'bind', b)
      assert.equal(
        (await callback('qq-xinyue', xinyue, 'A', b, 'state')).url.searchParams.get('oauth'),
        'error',
      )
      assert.equal((await callback('qq', xinyue, 'A', b)).url.searchParams.get('oauth'), 'error')
      assert.equal((await callback('qq-xinyue', xinyue, 'A', b)).url.searchParams.get('oauth'), 'bound')
      assert.equal((await callback('qq-xinyue', xinyue, 'A', b)).url.searchParams.get('oauth'), 'error')
      assert.equal((await login('qq-xinyue', 'A')).user.id, b.user.id)
      assert.equal((await login('qq', 'A')).user.id, a.user.id)
      assert.equal((await request('oauth/qq', 'DELETE', {}, b)).status, 409, '测试通道不算长期恢复方式')
      assert.equal((await request('oauth/qq-xinyue', 'DELETE', {}, b)).status, 200)
      assert.equal((await login('qq', 'B')).user.id, b.user.id)
      assert.deepEqual(
        new OAuth(db, auth, platform, { ...config, NODE_ENV: 'production' })
          .options()
          .map((row) => row.provider),
        ['qq', 'discord'],
      )
      const disposable = await login('qq', 'DELETE-ME')
      assert.equal(disposable.user.email, null)
      assert.equal(disposable.user.hasPassword, false)
      await new AccountDeletion(db, platform).remove({ ...disposable.user, status: 'active' })
      assert.equal(
        (await db.rows('SELECT * FROM oauth_identities WHERE user_id=?', [disposable.user.id])).length,
        0,
      )
      assert.equal(
        (await db.rows<{ status: string }>('SELECT status FROM users WHERE id=?', [disposable.user.id]))[0]!
          .status,
        'deleted',
      )
      await assert.rejects(() => auth.session(disposable.session), /过期/)
      assert.notEqual((await login('qq', 'DELETE-ME')).user.id, disposable.user.id)
      assert.equal((await request('oauth/discord/start', 'POST', { mode: 'bind' }, a, false)).status, 403)
      assert.equal((await request('oauth/qq', 'DELETE', {}, a, false)).status, 403)
      assert.equal((await request('credentials', 'POST', {}, a, false)).status, 403)
      const finalMethod = await request('oauth/qq', 'DELETE', {}, a)
      assert.equal(finalMethod.status, 409)
      assert.match(((await finalMethod.json()) as { message: string }).message, /先设置邮箱和密码/)
      const conflict = await callback('qq', await start('qq', 'bind', b), 'A', b)
      assert.equal(conflict.url.searchParams.get('oauth'), 'error')
      assert.match(conflict.url.searchParams.get('oauth_message')!, /已绑定其他账号/)
      assert.equal(conflict.response.headers.getSetCookie().length, 1, '失败不设置新的登录 Cookie')
      const bound = await callback('discord', await start('discord', 'bind', a), 'D', a)
      assert.equal(bound.url.searchParams.get('oauth'), 'bound')
      const bindings = (await (await request('oauth/bindings', 'GET', undefined, a)).json()) as {
        provider: string
        bound: boolean
        subject?: string
      }[]
      assert.deepEqual(
        bindings.map((row) => [row.provider, row.bound]),
        [
          ['qq', true],
          ['discord', true],
          ['qq-xinyue', false],
        ],
      )
      assert.ok(bindings.every((row) => !('subject' in row)))
      const discordLogin = await login('discord', 'D')
      assert.equal(discordLogin.user.id, a.user.id)
      const restricted = new OAuth(db, auth, platform, {
        ...config,
        DISCORD_CLIENT_ID: '',
        DISCORD_CLIENT_SECRET: '',
      })
      await assert.rejects(() => restricted.unlink(a.user.id, 'qq', a.session), /先设置邮箱和密码/)
      const sameProvider = await callback('discord', await start('discord', 'bind', a), 'OTHER', a)
      assert.match(sameProvider.url.searchParams.get('oauth_message')!, /已绑定另一个同类账号/)
      const changed = await callback('discord', await start('discord', 'bind', a), 'UNBOUND', b)
      assert.match(changed.url.searchParams.get('oauth_message')!, /登录状态已变化/)
      const expiredSession = await auth.issueSession(a.user.id)
      const pending = await start('discord', 'bind', expiredSession)
      await db.execute('DELETE FROM auth_sessions WHERE token_hash=?', [digest(expiredSession.session)])
      assert.equal(
        (await callback('discord', pending, 'UNBOUND', expiredSession)).url.searchParams.get('oauth'),
        'error',
      )
      assert.equal((await request('oauth/qq', 'DELETE', {}, a)).status, 200)
      assert.equal((await request('oauth/discord', 'DELETE', {}, a)).status, 409)
      const email = prefix + '@example.com',
        password = 'OAuth completion password 2026!'
      const challenge = await auth.requestCode(email, 'registration', prefix)
      const mail = JSON.parse(await readFile(`.data/mail/${challenge.challengeId}.json`, 'utf8'))
      const code = mail.text.match(/\d{6}/)[0]
      const credentials = {
        email,
        challengeId: challenge.challengeId,
        code,
        password,
        confirmPassword: password,
      }
      const wrong = code === '000000' ? '111111' : '000000'
      assert.equal((await request('credentials', 'POST', { ...credentials, code: wrong }, a)).status, 422)
      assert.equal(
        (
          await db.rows<{ failed_attempts: number }>(
            'SELECT failed_attempts FROM email_verification_challenges WHERE id=?',
            [challenge.challengeId],
          )
        )[0]!.failed_attempts,
        1,
      )
      assert.equal(
        (await request('credentials', 'POST', { ...credentials, confirmPassword: password + 'x' }, a)).status,
        422,
      )
      assert.equal((await request('credentials', 'POST', credentials, a)).status, 201)
      const completed = await auth.bootstrap(a.session)
      assert.equal(completed.user.email, email)
      assert.equal(completed.user.hasPassword, true)
      assert.equal((await auth.login(email, password, prefix)).user.id, a.user.id)
      assert.equal((await auth.login(a.user.username, password, prefix)).user.id, a.user.id)
      await assert.rejects(() => auth.session(otherDevice.session), /过期/)
      assert.equal((await request('credentials', 'POST', credentials, a)).status, 409)
      assert.equal((await request('oauth/discord', 'DELETE', {}, a)).status, 200)
      await callback('discord', await start('discord', 'bind', a), 'D', a)
      await new AccountDeletion(db, platform).remove(await auth.session(a.session), password)
      assert.equal((await db.rows('SELECT * FROM oauth_identities WHERE user_id=?', [a.user.id])).length, 0)
      assert.equal((await db.rows('SELECT * FROM oauth_flows WHERE user_id=?', [a.user.id])).length, 0)
      assert.notEqual((await login('discord', 'D')).user.id, a.user.id)
      await db.execute("UPDATE users SET status='disabled' WHERE id=?", [b.user.id])
      assert.equal(
        (await callback('qq', await start('qq', 'login'), 'B')).url.searchParams.get('oauth'),
        'error',
      )
    } finally {
      await app.close()
      for (const state of states) await db.execute('DELETE FROM oauth_flows WHERE state_hash=?', [state])
      for (const id of ids) {
        await db.execute('DELETE FROM oauth_flows WHERE user_id=?', [id])
        await db.execute('DELETE FROM oauth_identities WHERE user_id=?', [id])
        await db.execute('DELETE FROM auth_sessions WHERE user_id=?', [id])
        await db.execute('DELETE FROM audit_logs WHERE actor_id=?', [id])
        await db.execute('DELETE FROM users WHERE id=?', [id])
      }
      await db.pool.end()
    }
  },
)

test(
  'OAuth state：浏览器和 provider 绑定、过期、取消及并发重放都不能错误登录',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = {
      ...readConfig(),
      QQ_CLIENT_ID: '123',
      QQ_CLIENT_SECRET: 'fixture',
      DISCORD_CLIENT_ID: '456',
      DISCORD_CLIENT_SECRET: 'fixture',
    }
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      auth = new Auth(db, config, new Mailer(config)),
      platform = new Platform(db),
      ids = new Set<string>(),
      states: string[] = []
    class FakeProviders extends OAuthProviders {
      override async profile() {
        return { subject: randomUUID(), name: 'state fixture' }
      }
    }
    const oauth = new OAuth(db, auth, platform, config, new FakeProviders(config))
    const start = async () => {
      const flow = await oauth.start('qq', 'login', '/awards')
      const state = new URL(flow.url).searchParams.get('state')!
      states.push(digest(state))
      return { ...flow, state }
    }
    try {
      const flow = await start()
      const saved = (
        await db.rows<{ browser_hash: string; verifier: string }>(
          'SELECT browser_hash,verifier FROM oauth_flows WHERE state_hash=?',
          [digest(flow.state)],
        )
      )[0]!
      assert.notEqual(saved.browser_hash, flow.browser)
      assert.equal(saved.verifier.length, 86)
      await assert.rejects(
        () => oauth.callback('qq', { state: flow.state, code: 'a' }, token()),
        /当前浏览器/,
      )
      await assert.rejects(
        () => oauth.callback('discord', { state: flow.state, code: 'a' }, flow.browser),
        /当前浏览器/,
      )
      const attempts = await Promise.allSettled([
        oauth.callback('qq', { state: flow.state, code: 'a' }, flow.browser),
        oauth.callback('qq', { state: flow.state, code: 'a' }, flow.browser),
      ])
      assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
      for (const result of attempts)
        if (result.status === 'fulfilled' && result.value.mode === 'login')
          ids.add(result.value.session.user.id)
      await assert.rejects(() => oauth.callback('qq', { state: flow.state, code: 'a' }, flow.browser), /过期/)
      const expired = await start()
      await db.execute('UPDATE oauth_flows SET expires_at=1 WHERE state_hash=?', [digest(expired.state)])
      await assert.rejects(
        () => oauth.callback('qq', { state: expired.state, code: 'a' }, expired.browser),
        /过期/,
      )
      const cancelled = await start()
      await assert.rejects(
        () => oauth.callback('qq', { state: cancelled.state, error: 'access_denied' }, cancelled.browser),
        /已取消授权/,
      )
      await assert.rejects(
        () => oauth.callback('qq', { state: cancelled.state, code: 'a' }, cancelled.browser),
        /过期/,
      )
      await assert.rejects(
        () => oauth.callback('qq', { state: 'bad', code: 'a' }, flow.browser),
        /授权状态无效/,
      )
      const discord = await oauth.start('discord', 'login', '/account'),
        discordState = new URL(discord.url).searchParams.get('state')!
      states.push(digest(discordState))
      await assert.rejects(
        () =>
          oauth.callback(
            'discord',
            { state: discordState, code: 'a', iss: 'https://evil.example' },
            discord.browser,
          ),
        /来源不正确/,
      )
    } finally {
      for (const state of states) await db.execute('DELETE FROM oauth_flows WHERE state_hash=?', [state])
      for (const id of ids) {
        await db.execute('DELETE FROM auth_sessions WHERE user_id=?', [id])
        await db.execute('DELETE FROM audit_logs WHERE actor_id=?', [id])
        await db.execute('DELETE FROM users WHERE id=?', [id])
      }
      await db.pool.end()
    }
  },
)
