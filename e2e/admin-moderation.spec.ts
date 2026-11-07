import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

test('图片去重、隐藏恢复、永久删除及旧后端提示，超管降级保护', async ({ page, playwright }) => {
  const origin = 'http://127.0.0.1:3117'
  const password = 'Isolated moderator password 123!'
  await page.goto('/')
  await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录' })
  await dialog.getByLabel('用户名', { exact: true }).fill('browser_owner')
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog).not.toBeVisible()
  const { csrfToken } = await (
    await page.request.post('/api/auth/csrf', { headers: { Origin: origin }, data: {} })
  ).json()
  const headers = { Origin: origin, 'X-CSRF-Token': csrfToken }
  const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
  const image = await sharp({ create: { width: 91, height: 93, channels: 3, background: '#a78459' } })
    .png()
    .toBuffer()
  const upload = () =>
    page.request.post('/api/uploads', {
      headers,
      multipart: { file: { name: 'test.png', mimeType: 'image/png', buffer: image } },
    })
  const responses = await Promise.all([upload(), upload()])
  for (const response of responses) expect(response.ok()).toBeTruthy()
  const [first, second] = await Promise.all(responses.map((response) => response.json()))
  expect(second.id).toBe(first.id)
  const records = await (await page.request.get('/api/admin/assets')).json()
  expect(records.filter((record: { id: string }) => record.id === first.id)).toHaveLength(1)
  await page.goto('/admin')
  const row = page.locator(`[data-asset-id="${first.id}"]`)
  // A new frontend talking to an old backend must explain the mismatch and
  // disable actions; it must never reuse legacy DELETE (which only hid images).
  await page.route('**/api/admin/asset-management', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Cannot GET /api/admin/asset-management' }),
    }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('在宝塔更新代码、构建并重启后端')
  await expect(row.getByRole('button', { name: '永久删除', exact: true })).toBeDisabled()
  await expect(row.getByRole('button', { name: '隐藏图片', exact: true })).toBeDisabled()
  await page.unroute('**/api/admin/asset-management')
  await page.getByRole('button', { name: '重新检查图片服务', exact: true }).click()
  await expect(row.locator('img')).toHaveJSProperty('naturalWidth', 91)
  await row.getByRole('button', { name: '隐藏图片', exact: true }).click()
  await expect(row).toContainText('已隐藏')
  await expect(row.locator('img')).toHaveJSProperty('naturalWidth', 91)
  expect((await page.request.get('/api/assets/' + first.id)).status()).toBe(404)
  const preview = await page.request.get('/api/admin/assets/' + first.id)
  expect(preview.status()).toBe(200)
  expect(preview.headers()['cache-control']).toContain('no-store')
  const outsider = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  })
  try {
    expect((await outsider.get('/api/admin/assets/' + first.id)).status()).toBe(401)
    const login = await outsider.post('/api/auth/login', { data: { username: 'browser_member', password } })
    expect(login.ok()).toBeTruthy()
    const memberHeaders = { 'X-CSRF-Token': (await login.json()).csrfToken }
    expect((await outsider.get('/api/admin/assets/' + first.id)).status()).toBe(403)
    expect(
      (
        await outsider.delete('/api/admin/assets/' + first.id + '/permanent', {
          headers: memberHeaders,
          data: { confirmation: '永久删除' },
        })
      ).status(),
    ).toBe(403)
    expect(
      (
        await outsider.patch('/api/admin/assets/' + first.id, {
          headers: memberHeaders,
          data: { status: 'active' },
        })
      ).status(),
    ).toBe(403)
    const memberUpload = await outsider.post('/api/uploads', {
      headers: memberHeaders,
      multipart: { file: { name: 'same.png', mimeType: 'image/png', buffer: image } },
    })
    expect(memberUpload.ok()).toBeTruthy()
    expect((await memberUpload.json()).id).not.toBe(first.id)
  } finally {
    await outsider.dispose()
  }
  // Server errors must remain visible in the management UI.
  await page.route('**/api/admin/assets/' + first.id, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ message: '测试恢复失败，请重试。' }),
        })
      : route.continue(),
  )
  await row.getByRole('button', { name: '恢复图片', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '测试恢复失败' })).toBeVisible()
  await page.unroute('**/api/admin/assets/' + first.id)
  await row.getByRole('button', { name: '恢复图片', exact: true }).click()
  await expect(row).toContainText('正常')
  const publicImage = await page.request.get('/api/assets/' + first.id)
  expect(publicImage.status()).toBe(200)
  expect(publicImage.headers()['cache-control']).toContain('no-store')
  await page.reload()
  await expect(row.getByRole('button', { name: '隐藏图片', exact: true })).toBeVisible()
  // Cancellation, failure/retry, CSRF, confirmation, physical removal and reload.
  page.once('dialog', (dialog) => dialog.dismiss())
  await row.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(row).toBeVisible()
  expect(
    (
      await page.request.delete('/api/admin/assets/' + first.id + '/permanent', {
        headers: { Origin: origin },
        data: { confirmation: '永久删除' },
      })
    ).status(),
  ).toBe(403)
  expect(
    (
      await page.request.delete('/api/admin/assets/' + first.id + '/permanent', {
        headers,
        data: { confirmation: 'wrong' },
      })
    ).status(),
  ).toBe(422)
  await page.route('**/api/admin/assets/' + first.id + '/permanent', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: '测试删除失败，请重试。' }),
    }),
  )
  page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '测试删除失败' })).toBeVisible()
  await expect(row).toBeVisible()
  await page.unroute('**/api/admin/assets/' + first.id + '/permanent')
  page.once('dialog', (dialog) => dialog.accept())
  await row.getByRole('button', { name: '永久删除', exact: true }).click()
  await expect(row).toHaveCount(0)
  expect((await page.request.get('/api/assets/' + first.id)).status()).toBe(404)
  expect((await page.request.get('/api/admin/assets/' + first.id)).status()).toBe(404)
  await page.reload()
  await expect(row).toHaveCount(0)
  await page.goto('/admin/accounts')
  const ownRole = page.getByRole('combobox', { name: 'browser_owner的角色', exact: true })
  await expect(ownRole).toBeEnabled()
  await ownRole.selectOption('admin')
  await page.getByRole('button', { name: '保存browser_owner的角色', exact: true }).click()
  await expect(dialog).toBeVisible()
  expect((await page.request.get('/api/auth/me')).status()).toBe(401)
  await dialog.getByLabel('用户名', { exact: true }).fill('browser_owner_other')
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('combobox', { name: 'browser_owner_other的角色', exact: true })).toBeDisabled()
  await expect(
    page.getByText('最后一位有效超管；先提升另一账号，才能降级或禁用。', { exact: true }),
  ).toBeVisible()
  const me = await (await page.request.get('/api/auth/me')).json()
  const lastCsrf = await (
    await page.request.post('/api/auth/csrf', { headers: { Origin: origin }, data: {} })
  ).json()
  const denied = await page.request.patch('/api/admin/users/' + me.user.id, {
    headers: { Origin: origin, 'X-CSRF-Token': lastCsrf.csrfToken },
    data: { role: 'member' },
  })
  expect(denied.status()).toBe(409)
  expect((await denied.json()).message).toContain('至少保留')
})
