import { test, expect } from '@playwright/test'

test('慢页面切换显示橘子，不卡操作；手机、深色和减少动画可用，完成后退出', async ({ page }) => {
  const works = await (await page.request.get('/api/works')).json()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.locator('.app-loading')).toHaveCount(0)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/works', async (route) => {
    await pending
    await route.fulfill({ json: works })
  })
  const navigation = page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '作品书架', exact: true })
    .click()
  try {
    const loader = page.getByRole('status').filter({ hasText: '正在翻开下一页' })
    await expect(loader).toBeVisible()
    await expect(loader.locator('.loading-orange')).toHaveCSS('animation-name', /orange-hop/)
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'true')
    await expect(loader).toHaveCSS('pointer-events', 'none')
    await expect(loader.locator('.loading-orange')).toHaveCSS('width', '80px')
    await loader.screenshot({ path: test.info().outputPath('orange-light.png') })
    await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 1080 })
      const box = await loader.boundingBox()
      expect(Math.abs(box!.x + box!.width / 2 - width / 2)).toBeLessThan(1)
      expect(box!.y + box!.height).toBeLessThanOrEqual(1080)
      await expect(loader.locator('.loading-orange')).toHaveCSS('width', '80px')
    }
    await loader.screenshot({ path: test.info().outputPath('orange-desktop-route-dark.png') })
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      const box = await loader.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    }
    await loader.screenshot({ path: test.info().outputPath('orange-mobile-dark.png') })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(loader.locator('.loading-orange')).toHaveCSS('animation-name', 'none')
    await expect(loader.locator('.loading-leaf')).toHaveCSS('animation-name', 'none')
    await expect(loader.locator('.loading-shadow')).toHaveCSS('animation-name', 'none')
    release()
    await navigation
    await expect(page).toHaveURL(/\/works$/)
    await expect(page.locator('.app-loading')).toHaveCount(0)
    await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false')
  } finally {
    release()
  }
})

test('快速跳转不出现橘子；接口失败后加载状态退出并显示重试提示', async ({ page }) => {
  const works = await (await page.request.get('/api/works')).json()
  await page.goto('/')
  await expect(page.locator('.app-loading')).toHaveCount(0)
  let release!: () => void, requested!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const seen = new Promise<void>((resolve) => {
    requested = resolve
  })
  await page.route('**/api/works', async (route) => {
    requested()
    await pending
    await route.fulfill({ json: works })
  })
  const navigation = page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '作品书架', exact: true })
    .click()
  try {
    await seen
    expect(await page.locator('.app-loading').count()).toBe(0)
    release()
    await navigation
    await expect(page).toHaveURL(/\/works$/)
    await expect(page.locator('.app-loading')).toHaveCount(0)
  } finally {
    release()
  }
  await page.unroute('**/api/works')
  await page.goto('/')
  await expect(page.locator('.app-loading')).toHaveCount(0)
  await page.route('**/api/works', (route) =>
    route.fulfill({ status: 503, json: { message: '测试书库暂不可用' } }),
  )
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '作品书架', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('书库暂时未能加载')
  await expect(page.locator('.app-loading')).toHaveCount(0)
  await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false')
})
