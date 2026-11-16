import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { Config } from '../src/config'
import { decodeQqResponse, OAuthProviders } from '../src/oauth-providers'
import { oauthReturnPath } from '../src/oauth'

const config = {
  WEB_ORIGIN: 'https://forum.example.com',
  QQ_CLIENT_ID: '12345',
  QQ_CLIENT_SECRET: 'qq-test-secret',
  DISCORD_CLIENT_ID: '67890',
  DISCORD_CLIENT_SECRET: 'discord-test-secret',
} as Config

test('QQ JSON、JSONP 和表单响应只解析数据，不执行脚本', () => {
  assert.deepEqual(decodeQqResponse('callback( {"openid":"ABC"} );'), { openid: 'ABC' })
  assert.deepEqual(decodeQqResponse('{"ret":0}'), { ret: 0 })
  assert.deepEqual(decodeQqResponse('access_token=abc&expires_in=3600'), {
    access_token: 'abc',
    expires_in: '3600',
  })
  assert.throws(() => decodeQqResponse('callback(process.exit())'), /第三方授权/)
})

test('授权 URL 使用固定回调、最小 scope、state；Discord 启用 S256 PKCE', () => {
  const providers = new OAuthProviders(config)
  for (const provider of ['qq', 'discord'] as const) {
    const url = new URL(providers.authorize(provider, 'browser-state', 'server-verifier'))
    assert.equal(url.searchParams.get('state'), 'browser-state')
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(
      url.searchParams.get('redirect_uri'),
      config.WEB_ORIGIN + `/api/auth/oauth/${provider}/callback`,
    )
    assert.equal(url.searchParams.has('client_secret'), false)
    assert.equal(url.searchParams.get('scope'), provider === 'qq' ? 'get_user_info' : 'identify')
    if (provider === 'discord') {
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
      assert.equal(
        url.searchParams.get('code_challenge'),
        createHash('sha256').update('server-verifier').digest('base64url'),
      )
    }
  }
  assert.throws(
    () => new OAuthProviders({ ...config, QQ_CLIENT_SECRET: '' }).authorize('qq', 's', 'v'),
    /暂未开放/,
  )
})

test('QQ 服务端换令牌，校验应用 ID 和 openid；不返回 access_token', async () => {
  const calls: { url: URL; options: RequestInit }[] = []
  const responses = [
    'access_token=server-only-token&expires_in=3600',
    'callback({"client_id":"12345","openid":"abcdef0123456789abcdef0123456789"});',
    '{"ret":0,"nickname":" QQ 同好 "}',
  ]
  const providers = new OAuthProviders(config, (async (input, options) => {
    calls.push({ url: new URL(String(input)), options: options! })
    return new Response(responses.shift())
  }) as typeof fetch)
  assert.deepEqual(await providers.profile('qq', 'once-code', 'verifier'), {
    subject: 'ABCDEF0123456789ABCDEF0123456789',
    name: 'QQ 同好',
  })
  assert.equal(calls[0]!.url.searchParams.get('client_secret'), config.QQ_CLIENT_SECRET)
  assert.equal(calls[0]!.url.searchParams.get('code'), 'once-code')
  assert.equal(calls[1]!.url.searchParams.get('access_token'), 'server-only-token')
  assert.ok(calls.every((call) => call.options.redirect === 'error'))
  const invalid = new OAuthProviders(
    config,
    (async () => new Response('{"access_token":"x","client_id":"wrong","openid":"invalid"}')) as typeof fetch,
  )
  await assert.rejects(() => invalid.profile('qq', 'code', 'v'), /第三方授权/)
})

test('Discord 服务端 POST 换令牌、传 PKCE verifier，再以 Bearer 查询本人', async () => {
  const calls: { url: string; options: RequestInit }[] = []
  const responses = [
    { access_token: 'discord-private-token' },
    { id: '123456789012345678', global_name: 'Discord 昵称', username: 'login-name' },
  ]
  const providers = new OAuthProviders(config, (async (url, options) => {
    calls.push({ url: String(url), options: options! })
    return Response.json(responses.shift())
  }) as typeof fetch)
  assert.deepEqual(await providers.profile('discord', 'code', 'private-verifier'), {
    subject: '123456789012345678',
    name: 'Discord 昵称',
  })
  assert.equal(calls[0]!.options.method, 'POST')
  const body = new URLSearchParams(calls[0]!.options.body as string)
  assert.equal(body.get('code_verifier'), 'private-verifier')
  assert.equal(body.get('client_secret'), config.DISCORD_CLIENT_SECRET)
  assert.equal(new Headers(calls[1]!.options.headers).get('authorization'), 'Bearer discord-private-token')
  const invalid = new OAuthProviders(config, (async () =>
    Response.json({ access_token: 'x', id: 123 })) as typeof fetch)
  await assert.rejects(() => invalid.profile('discord', 'code', 'v'), /第三方授权/)
  const denied = new OAuthProviders(
    config,
    (async () => new Response('private provider error and token', { status: 400 })) as typeof fetch,
  )
  await assert.rejects(
    () => denied.profile('discord', 'code', 'v'),
    (error) => {
      assert.doesNotMatch(String(error), /private provider error/)
      return true
    },
  )
})

test('OAuth 仅返回站内普通页面，拒绝开放跳转和 API 路径', () => {
  assert.equal(oauthReturnPath('/awards?tab=ballot#vote', config.WEB_ORIGIN), '/awards?tab=ballot#vote')
  for (const path of ['https://evil.example', '//evil.example', '/\\evil.example', '/api/auth/me', '/a\n'])
    assert.throws(() => oauthReturnPath(path, config.WEB_ORIGIN), /返回页面/)
})
