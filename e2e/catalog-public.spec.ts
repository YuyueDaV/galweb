import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

test('普通用户添加书库、上传及更换封面、自动署名和重复拦截', async ({ page }) => {
  const origin = 'http://127.0.0.1:3117'
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
  const image = await sharp({ create: { width: 100, height: 150, channels: 3, background: '#8259ab' } })
    .png()
    .toBuffer()
  const title = '成员贡献的故事 ' + Date.now().toString(36)
  await page.goto('/works')
  await page.getByRole('link', { name: '添加作品', exact: true }).click()
  await page.getByLabel('作品名称', { exact: true }).fill(title)
  await page.getByLabel('原文名／其他名称', { exact: true }).fill('Public story ' + title)
  await page.getByLabel('作品介绍', { exact: true }).fill('由普通注册用户添加的作品，封面来自本站上传。')
  await page
    .getByLabel('上传作品封面', { exact: true })
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('img', { name: '作品封面预览', exact: true })).toHaveAttribute(
    'src',
    /^\/api\/assets\//,
  )
  await page.getByRole('button', { name: '添加到书库', exact: true }).click()
  const completed = page.getByRole('dialog', { name: '作品添加成功', exact: true })
  await expect(completed).toContainText(title)
  await page.setViewportSize({ width: 390, height: 844 })
  await completed.screenshot({ path: test.info().outputPath('add-work-success-mobile.png') })
  await completed.getByRole('button', { name: '查看作品', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.locator('.work-detail-intro')).toContainText('添加人：browser_member')
  const workUrl = page.url()
  const before = await page.locator('.work-detail-cover img').getAttribute('src')
  const next = await sharp({ create: { width: 100, height: 150, channels: 3, background: '#ddaa66' } })
    .png()
    .toBuffer()
  await page
    .getByLabel('更换作品封面', { exact: true })
    .setInputFiles({ name: 'new-cover.png', mimeType: 'image/png', buffer: next })
  await expect(page.getByRole('status').filter({ hasText: '作品封面已更新' })).toBeVisible()
  await expect(page.locator('.work-detail-cover img')).not.toHaveAttribute('src', before!)
  await page.goto('/works')
  await expect(page.locator('.work-card').filter({ hasText: title })).toContainText('添加人：browser_member')
  await page.goto('/works/new')
  await page.getByLabel('作品名称', { exact: true }).fill(title + ' 续篇')
  await page.getByRole('button', { name: '添加到书库', exact: true }).click()
  await expect(completed).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(completed).not.toBeVisible()
  await expect(page.getByRole('heading', { name: '作品已添加', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '继续添加', exact: true }).click()
  await expect(page.getByLabel('作品名称', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Bangumi 作品名称', { exact: true })).toBeFocused()
  await page.getByLabel('作品名称', { exact: true }).fill(title.toUpperCase())
  await expect(page.getByRole('status').filter({ hasText: '不能重复添加' })).toBeVisible()
  await expect(page.getByRole('button', { name: '添加到书库', exact: true })).toBeDisabled()
  await page.getByRole('link', { name: '查看已有作品 ↗', exact: true }).click()
  await expect(page).toHaveURL(workUrl)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/works/new')
  const subject = {
    id: 191919,
    title: '搜索资料示例 ' + Date.now(),
    originalTitle: 'Search fixture',
    summary: '搜索得到的作品资料',
    studio: '测试制作组',
    date: '2026-01-01',
    coverUrl: '',
    score: 8,
    ratingCount: 1,
    tags: [],
    syncedAt: Date.now(),
  }
  await page.route('**/api/bangumi/search?*', (route) =>
    route.fulfill({ json: { items: [subject], total: 1, page: 1 } }),
  )
  await page.getByLabel('Bangumi 作品名称', { exact: true }).fill('搜索示例')
  await page.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
  await expect(page.getByRole('button', { name: '使用这部作品资料', exact: true })).toBeVisible()
  await page.getByLabel('包含受限条目', { exact: true }).check()
  const authorizedSearch = page.waitForRequest(
    (request) =>
      request.url().includes('/api/bangumi/search?') && request.url().includes('includeRestricted=true'),
  )
  await page.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
  await authorizedSearch
  await page.getByRole('button', { name: '使用这部作品资料', exact: true }).click()
  await expect(page.getByLabel('作品名称', { exact: true })).toHaveValue(subject.title)
  await expect(page.getByLabel('作品介绍', { exact: true })).toHaveValue(subject.summary)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  await page.screenshot({ path: test.info().outputPath('public-catalog-mobile.png'), fullPage: true })
})

test('活动刷新等待真实数据，不展示默认第二届', async ({ page }) => {
  const list = await (await page.request.get('/api/award-campaigns')).json()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/award-campaigns**', async (route) => {
    await gate
    await route.continue()
  })
  try {
    await page.goto('/awards', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('status').filter({ hasText: '正在加载活动' })).toBeVisible()
    await expect(page.locator('.award-edition-pill')).toHaveCount(0)
    release()
    await expect(page.locator('.award-edition-pill')).toHaveText('第 ' + list[0].edition + ' 届十二橙器')
  } finally {
    release()
  }
})
