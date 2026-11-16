import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url))
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url))
const { ref } = webRequire('vue'),
  ts = apiRequire('typescript')
const source = await readFile(new URL('../apps/web/app/composables/useAuth.ts', import.meta.url), 'utf8')
const account = { id: 'user-a', nickname: '已登录同好', role: 'member' }
function session({ server = false, cookie = 'czx_session=valid', state = new Map() } = {}) {
  const app = {},
    requests = [],
    module = { exports: {} }
  const useState = (key, initial) => {
    if (!state.has(key)) state.set(key, ref(initial()))
    return state.get(key)
  }
  const fetch = (path, options) =>
    new Promise((resolve, reject) => requests.push({ path, options, resolve, reject }))
  const code = ts.transpileModule(
    source.replaceAll('import.meta.server', String(server)).replaceAll('import.meta.client', String(!server)),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    },
  ).outputText
  new Function('exports', 'useNuxtApp', 'useRequestFetch', 'useRequestHeaders', 'useState', '$fetch', code)(
    module.exports,
    () => app,
    () => fetch,
    () => ({ cookie }),
    useState,
    fetch,
  )
  return { create: module.exports.useAuth, requests, state }
}

test('首屏恢复账号与 CSRF；多个组件只请求一次，水合后不再重新获取', async () => {
  const server = session({ server: true }),
    a = server.create(),
    b = server.create()
  const first = a.initialize(),
    second = b.initialize()
  assert.equal(server.requests.length, 1)
  server.requests.shift().resolve({ user: account, csrfToken: 'csrf-a' })
  await Promise.all([first, second])
  assert.equal(a.user.value.id, 'user-a')
  assert.equal(b.ready.value, true)
  const client = session({ state: server.state })
  await client.create().initialize()
  assert.equal(client.requests.length, 0)
})

test('SSR 请求之间隔离；游客不请求会话，失败不假装已退出', async () => {
  const a = session({ server: true }),
    b = session({ server: true }),
    guest = session({ server: true, cookie: 'czx-theme=dark' })
  await guest.create().initialize()
  assert.equal(guest.requests.length, 0)
  const one = a.create(),
    two = b.create(),
    loadingA = one.initialize(),
    loadingB = two.initialize()
  a.requests.shift().resolve({ user: account, csrfToken: 'csrf-a' })
  b.requests.shift().reject({ statusCode: 503 })
  await Promise.all([loadingA, loadingB])
  assert.equal(one.user.value.id, 'user-a')
  assert.equal(two.user.value, null)
  assert.equal(two.ready.value, false)
  assert.match(two.restoreError.value, /重试/)
  const refreshing = one.refresh()
  a.requests.shift().reject({ statusCode: 502 })
  await refreshing
  assert.equal(one.user.value.id, 'user-a')
  const expired = one.refresh()
  a.requests.shift().reject({ statusCode: 401 })
  await expired
  assert.equal(one.user.value, null)
  assert.equal(one.ready.value, true)
})

test('旧会话只补充 CSRF，不闪回游客；退出后迟到响应不能恢复旧账号', async () => {
  const server = session({ server: true }),
    auth = server.create(),
    initialized = auth.initialize()
  server.requests.shift().resolve({ user: account })
  await initialized
  const client = session({ state: server.state }),
    current = client.create()
  const token = current.initialize(),
    same = client.create().initialize()
  assert.equal(client.requests.length, 1)
  assert.equal(client.requests[0].path, '/api/auth/csrf')
  assert.equal(current.user.value.id, 'user-a')
  client.requests.shift().resolve({ csrfToken: 'csrf-a' })
  await Promise.all([token, same])
  const refresh = current.refresh(),
    pending = client.requests.shift()
  const logout = current.logout()
  client.requests.shift().resolve({})
  await logout
  pending.resolve({ user: account, csrfToken: 'old-csrf' })
  await refresh
  assert.equal(current.user.value, null)
})

test('未登录操作打开统一登录窗口，普通游客会话检查不弹窗', async () => {
  const client = session(),
    auth = client.create()
  const loading = auth.initialize()
  client.requests.shift().reject({ statusCode: 401 })
  await loading
  assert.equal(client.state.get('forum-login').value, false)
  assert.equal(auth.requireLogin('请先登录后投票。'), false)
  assert.equal(client.state.get('forum-login').value, true)
  assert.match(auth.loginNotice.value, /投票/)
  assert.equal(client.requests.length, 0)
})

test('受保护操作过期时弹窗；并发迟到的 401 不会重复弹窗或清除新会话', async () => {
  const client = session(),
    auth = client.create()
  auth.user.value = account
  const first = auth.request('/library/1', {}, 'PUT')
  const second = auth.request('/notifications/read', {}, 'PUT')
  const one = client.requests.shift(),
    two = client.requests.shift()
  one.reject({ statusCode: 401, data: { message: '请先登录。' } })
  await assert.rejects(first, /请先登录/)
  assert.match(auth.loginNotice.value, /过期/)
  assert.equal(client.state.get('forum-login').value, true)
  client.state.get('forum-login').value = false
  const login = auth.login('member', 'password')
  client.requests.shift().resolve({ user: account, csrfToken: 'new-csrf' })
  await login
  two.reject({ statusCode: 401 })
  await assert.rejects(second)
  assert.equal(client.state.get('forum-login').value, false)
  assert.equal(auth.user.value.id, account.id)
})

test('登录输错密码与权限不足保留原错误，不触发登录提醒循环；受保护的读取也有提醒', async () => {
  const client = session(),
    auth = client.create()
  for (const [path, status] of [
    ['/auth/login', 401],
    ['/auth/password-reset/confirm', 401],
    ['/admin/users', 403],
  ]) {
    const request = auth.request(path, {})
    client.requests.shift().reject({ statusCode: status, data: { message: '原始错误' } })
    await assert.rejects(request, /原始错误/)
    assert.equal(client.state.get('forum-login').value, false)
  }
  const request = auth.request('/posts?saved=true')
  client.requests.shift().reject({ statusCode: 401 })
  await assert.rejects(request)
  assert.equal(client.state.get('forum-login').value, true)
})
