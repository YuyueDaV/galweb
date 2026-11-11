import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

test('主题在脚本加载前生效；慢请求展示加载提示并在完成后退出', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(() => {
    if (!localStorage.getItem('chengzhixiang-theme')) localStorage.setItem('chengzhixiang-theme', 'dark')
  })
  let start!: () => void, finish!: () => void
  const scripts = new Promise<void>((resolve) => {
    start = resolve
  })
  const auth = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route('**/_nuxt/*.js', async (route) => {
    await scripts
    await route.continue()
  })
  await page.route('**/api/auth/me', async (route) => {
    await auth
    await route.fulfill({ status: 401, json: { message: '请先登录。' } })
  })
  try {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    await expect(page.locator('.app-loading .loading-orange')).toBeVisible()
    const initialLoader = page.locator('.app-loading.is-initial')
    await expect(initialLoader.locator('.loading-orange')).toHaveCSS('width', '112px')
    await expect
      .poll(async () => {
        const box = await initialLoader.boundingBox()
        return Math.abs(box!.y + box!.height / 2 - 500)
      })
      .toBeLessThan(2)
    await initialLoader.screenshot({ path: test.info().outputPath('orange-desktop-initial-dark.png') })
    start()
    await expect(page.getByRole('status').filter({ hasText: '正在加载故事' })).toBeVisible()
    finish()
    await expect(page.locator('.app-loading')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '切换浅色模式', exact: true })).toBeVisible()
    await page.unroute('**/_nuxt/*.js')
    const response = await page.reload()
    expect(await response!.text()).toMatch(/data-theme="dark"/)
    await expect(page.getByRole('button', { name: '切换浅色模式', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '切换浅色模式', exact: true }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  } finally {
    start()
    finish()
  }
})

test('配图独立保存、内嵌去重与链接删除回退；Emoji 回复和通知摘要', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  await page.goto('/')
  await page.getByRole('button', { name: '写点什么', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '把你的故事，留在这里。' })
  const body = dialog.getByLabel('帖子正文', { exact: true })
  await dialog.getByLabel('帖子标题', { exact: true }).fill('独立配图与表情回复测试')
  await body.fill('上传的图片不会因为正文链接被删除而丢失。')
  const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
  const buffer = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#aaccee' } })
    .png()
    .toBuffer()
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'attachment.png', mimeType: 'image/png', buffer })
  await expect(dialog.getByRole('button', { name: '插入正文', exact: true })).toBeVisible()
  await expect(body).not.toHaveValue(/\/api\/assets/)
  await dialog.getByRole('button', { name: '插入正文', exact: true }).click()
  await expect(body).toHaveValue(/!\[图片\]/)
  const withImage = await body.inputValue()
  await dialog.getByRole('button', { name: '预览', exact: true }).click()
  await expect(dialog.locator('.editor-preview img')).toHaveCount(1)
  await expect(dialog.locator('.post-attachments')).toHaveCount(0)
  await dialog.getByRole('button', { name: '继续编辑', exact: true }).click()
  await body.fill(withImage.replace(/!\[图片\]\([^)]*\)/g, ''))
  await dialog.getByRole('button', { name: '发布帖子', exact: true }).click()
  await expect(page.getByRole('heading', { name: '独立配图与表情回复测试', exact: true })).toBeVisible()
  await expect(page.locator('.post-attachments .reading-image-button img')).toHaveCount(1)
  const url = page.url()
  const member = await browser.newContext({ baseURL: origin })
  try {
    await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
    })
    const visitor = await member.newPage()
    await visitor.goto(url)
    await visitor.setViewportSize({ width: 390, height: 844 })
    const textarea = visitor.getByLabel(/也来说两句/)
    await textarea.fill('喜欢这个故事')
    await textarea.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(2, 2))
    await visitor.getByRole('button', { name: '😊 表情', exact: true }).click()
    await visitor.screenshot({ path: test.info().outputPath('reply-emojis-mobile.png') })
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await visitor.getByRole('button', { name: '赞 👍', exact: true }).click()
    await expect(textarea).toHaveValue('喜欢👍这个故事')
    await visitor.getByRole('button', { name: '发布回复', exact: true }).click()
    await expect(visitor.locator('.reply-card')).toContainText('喜欢👍这个故事')
    await page.goto('/notifications')
    const item = page.locator('.inbox-item').filter({ hasText: '独立配图与表情回复测试' }).first()
    await expect(item.locator('.notification-excerpt')).toHaveText('喜欢👍这个故事')
    await page.screenshot({ path: test.info().outputPath('notification-excerpt.png') })
    await item.getByRole('button', { name: '查看回复', exact: true }).click()
    await expect(page).toHaveURL(/#reply-/)
  } finally {
    await member.close()
  }
})
