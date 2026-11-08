import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

test('管理员上传站点背景、访客生效、纯色预设和深色模式、失败及版本冲突提示', async ({
  page,
  browser,
  playwright,
}) => {
  const origin = 'http://127.0.0.1:3117'
  const staff = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })
  const visitorContext = await browser.newContext({ baseURL: origin })
  const original = await (await staff.get('/api/site-settings')).json()
  let headers: Record<string, string> = {}
  try {
    const login = await staff.post('/api/auth/login', {
      data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
    })
    headers = { 'X-CSRF-Token': (await login.json()).csrfToken }
    await page.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
    })
    await page.goto('/admin/site')
    const save = page.getByRole('button', { name: '保存配置', exact: true })
    await expect(save).toBeEnabled()
    const input = page.getByLabel('网站背景图片文件', { exact: true })
    await input.setInputFiles({
      name: 'large.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    })
    await expect(page.getByRole('alert')).toContainText('不能超过 5 MB')
    const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
    const image = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#a8bbd1' } })
      .png()
      .toBuffer()
    const uploaded = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/uploads',
    )
    await input.setInputFiles({ name: 'site-background.png', mimeType: 'image/png', buffer: image })
    const upload = await uploaded
    expect(upload.ok()).toBeTruthy()
    const { id } = await upload.json()
    await expect(page.getByRole('status').filter({ hasText: '背景图片已上传' })).toBeVisible()
    await save.click()
    await expect(page.getByRole('status').filter({ hasText: '站点配置已保存' })).toBeVisible()
    const visitor = await visitorContext.newPage()
    await visitor.goto('/')
    await expect(visitor.locator('.site-background img')).toHaveAttribute('src', '/api/assets/' + id)
    await expect(visitor.locator('.site-background img')).toHaveJSProperty('naturalWidth', 1280)
    // Removing a public background image must fall back without a broken backdrop.
    expect(
      (await staff.patch('/api/admin/assets/' + id, { headers, data: { status: 'hidden' } })).ok(),
    ).toBeTruthy()
    await visitor.reload()
    await expect(visitor.locator('.site-background img')).toHaveAttribute('src', /backgrounds\/autumn-/)
    expect(
      (await staff.patch('/api/admin/assets/' + id, { headers, data: { status: 'active' } })).ok(),
    ).toBeTruthy()
    await visitor.reload()
    await expect(visitor.locator('.site-background img')).toHaveAttribute('src', '/api/assets/' + id)
    await page.getByRole('button', { name: '纯色背景', exact: true }).click()
    await page.getByRole('button', { name: '雾蓝', exact: true }).click()
    await save.click()
    await expect(page.getByRole('status').filter({ hasText: '站点配置已保存' })).toBeVisible()
    await visitor.reload()
    await expect(visitor.locator('.site-background img')).toHaveCount(0)
    await expect(visitor.locator('.site-background')).toHaveCSS('background-color', 'rgb(232, 238, 245)')
    await visitor.getByRole('button', { name: '切换深色模式', exact: true }).click()
    await expect(visitor.locator('.site-background')).toHaveCSS('background-color', 'rgb(27, 37, 50)')
    await page.screenshot({ path: test.info().outputPath('background-settings.png'), fullPage: true })
    await visitor.setViewportSize({ width: 390, height: 844 })
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    const latest = await (await staff.get('/api/site-settings')).json()
    expect((await staff.put('/api/admin/site-settings', { headers, data: latest })).ok()).toBeTruthy()
    await save.click()
    await expect(page.getByRole('alert').filter({ hasText: '刷新' })).toBeVisible()
    await page.reload()
    await expect(save).toBeEnabled()
    await page.getByRole('button', { name: '图片背景', exact: true }).click()
    await page.getByRole('button', { name: '使用默认插画', exact: true }).click()
    await save.click()
    await expect(page.getByRole('status').filter({ hasText: '站点配置已保存' })).toBeVisible()
    await visitor.goto('/')
    await expect(visitor.locator('.site-background img')).toHaveAttribute('src', /backgrounds\/autumn-/)
    await expect(visitor.locator('.site-background img')).toHaveJSProperty('naturalWidth', 960)
  } finally {
    if (headers['X-CSRF-Token']) {
      const latest = await (await staff.get('/api/site-settings')).json()
      await staff.put('/api/admin/site-settings', { headers, data: { ...original, version: latest.version } })
    }
    await visitorContext.close()
    await staff.dispose()
  }
})
