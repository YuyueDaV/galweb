import { test, expect } from './fixtures'

test('慢页面切换显示全屏橘子；手机、深色和减少动画可用，完成后退出', async ({ page }) => {
  const works = await (await page.request.get('/api/works')).json()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.locator('.app-loading')).toHaveCount(0)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/works?view=summary', async (route) => {
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
    await expect(loader.locator('.loading-orange')).toHaveCSS('width', '112px')
    expect(await loader.boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 1000 })
    await loader.screenshot({ path: test.info().outputPath('orange-light.png') })
    await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    for (const width of [1366, 1920]) {
      await page.setViewportSize({ width, height: 1080 })
      expect(await loader.boundingBox()).toEqual({ x: 0, y: 0, width, height: 1080 })
      await expect(loader.locator('.loading-orange')).toHaveCSS('width', '112px')
    }
    await loader.screenshot({ path: test.info().outputPath('orange-desktop-route-dark.png') })
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await loader.boundingBox()).toEqual({ x: 0, y: 0, width, height: 844 })
      await expect(loader.locator('.loading-orange')).toHaveCSS('width', '96px')
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
  await page.route('**/api/works?view=summary', async (route) => {
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
  await page.unroute('**/api/works?view=summary')
  await page.goto('/')
  await expect(page.locator('.app-loading')).toHaveCount(0)
  await page.route('**/api/works?view=summary', (route) =>
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

for (const entry of [
  { label: 'Tier 榜单', path: '/tiers', endpoint: '/api/tier-lists', heading: /同好会 Tier 榜单/ },
  {
    label: '社团动态与相册',
    path: '/community',
    endpoint: '/api/community-entries',
    heading: /把相遇，留成故事/,
  },
  { label: '我的书单', path: '/library', endpoint: '/api/library', heading: /我的书单/, signIn: true },
]) {
  test(`侧栏进入${entry.label}时等待主数据，使用全屏小橙子`, async ({ page, baseURL }) => {
    if (entry.signIn) {
      const login = await page.request.post('/api/auth/login', {
        headers: { Origin: baseURL! },
        data: { username: 'browser_loading', password: 'Isolated moderator password 123!' },
      })
      expect(login.ok()).toBeTruthy()
    }
    await page.setViewportSize({ width: 1366, height: 900 })
    await page.goto('/')
    await expect(page.locator('.app-loading')).toHaveCount(0)
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(
      (url) => url.pathname === entry.endpoint,
      async (route) => {
        await pending
        await route.continue()
      },
    )
    const navigation = page
      .getByRole('complementary', { name: '社区导航' })
      .getByRole('link', { name: entry.label, exact: true })
      .click()
    try {
      const loader = page.getByRole('status').filter({ hasText: '正在翻开下一页' })
      await expect(loader.locator('.loading-panel')).toHaveCSS('opacity', '1')
      expect(await loader.boundingBox()).toEqual({ x: 0, y: 0, width: 1366, height: 900 })
      await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'true')
      release()
      await navigation
      await expect(page).toHaveURL((url) => url.pathname === entry.path)
      await expect(page.getByRole('heading', { name: entry.heading })).toBeVisible()
      await expect(page.locator('.app-loading')).toHaveCount(0)
      await expect(page.locator('#main-content')).toHaveAttribute('aria-busy', 'false')
    } finally {
      release()
    }
  })
}
