import { test, expect } from '@playwright/test'

test('批量玻璃：折射资源有界、路由清理、主题与手机降级、减少透明度和动画', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    const active = new Set<string>()
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      active.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      active.delete(url)
      revoke(url)
    }
    Object.defineProperty(window, '__glassUrls', { value: active })
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const header = page.locator('.site-header')
  await expect(header).toHaveAttribute('data-liquid-glass', 'refracted')
  await expect(header).toHaveCSS('backdrop-filter', /url\(/)
  await expect(page.locator('.category-card').first()).toHaveAttribute(
    'data-liquid-glass',
    /refracted|frosted/,
  )
  await page.screenshot({ path: test.info().outputPath('liquid-home-light.png') })
  await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(header).toHaveCSS('background-color', 'rgba(36, 40, 32, 0.64)')
  await page.screenshot({ path: test.info().outputPath('liquid-home-dark.png') })
  await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('data-liquid-glass', /refracted|frosted/)
  await dialog.getByLabel('用户名', { exact: true }).fill('glass-focus-check')
  await expect(dialog.getByLabel('用户名', { exact: true })).toHaveValue('glass-focus-check')
  await dialog.getByRole('button', { name: '关闭登录窗口', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(header).toHaveAttribute('data-liquid-glass', 'refracted')
  for (const [path, name] of [
    ['/works', '作品书架'],
    ['/tiers', 'Tier 榜单'],
    ['/', '社区广场'],
  ]) {
    await page
      .getByRole('complementary', { name: '社区导航' })
      .getByRole('link', { name: name!, exact: true })
      .click()
    await expect(page).toHaveURL((url) => url.pathname === path)
    await expect(header).toHaveAttribute('data-liquid-glass', 'refracted')
    await expect.poll(() => page.locator('.liquid-glass-definitions filter').count()).toBeLessThanOrEqual(10)
    const maps = await page.locator('.liquid-glass-definitions feImage').evaluateAll(async (nodes) => {
      return Promise.all(
        nodes.map(async (node) => {
          const bytes = await (await fetch(node.getAttribute('href')!)).arrayBuffer()
          const view = new DataView(bytes)
          return view.getUint32(16) * view.getUint32(20)
        }),
      )
    })
    expect(maps.every((pixels) => pixels <= 122_000)).toBeTruthy()
  }
  await page.goto('/tiers')
  const primary = page.getByRole('link', { name: '制作我的个人 Tier 榜', exact: true })
  await expect(primary).toHaveCSS('color', 'rgb(255, 250, 244)')
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(header).toHaveAttribute('data-liquid-glass', 'frosted')
    await expect.poll(() => page.locator('.liquid-glass-definitions filter').count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  }
  await page.screenshot({ path: test.info().outputPath('liquid-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(header).toHaveAttribute('data-liquid-glass', 'refracted')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(header).toHaveAttribute('data-liquid-glass', 'frosted')
  await expect(header).toHaveCSS('transition-duration', '0s')
  await expect.poll(() => page.locator('.liquid-glass-definitions filter').count()).toBe(0)
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __glassUrls: Set<string> }).__glassUrls.size))
    .toBe(0)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
  await expect(header).toHaveAttribute('data-liquid-glass', 'opaque')
  await expect(header).toHaveCSS('backdrop-filter', 'none')
  await expect(header).toHaveCSS('background-color', 'rgb(36, 40, 32)')
  expect(errors).toEqual([])
})

test('玻璃贴图编码失败或 URL 滤镜不可用时，登录弹窗和导航仍能操作', async ({ browser }) => {
  for (const failure of ['encoding', 'unsupported']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    try {
      await context.addInitScript((failure) => {
        if (failure === 'encoding')
          HTMLCanvasElement.prototype.toBlob = function (callback) {
            callback(null)
          }
        else {
          const supports = CSS.supports.bind(CSS)
          CSS.supports = ((property: string, value?: string) =>
            value?.includes('url(')
              ? false
              : value === undefined
                ? supports(property)
                : supports(property, value)) as typeof CSS.supports
        }
      }, failure)
      const page = await context.newPage(),
        errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/tiers')
      await expect(page.locator('.site-header')).toHaveAttribute('data-liquid-glass', 'frosted')
      await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '账号与登录' })
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '关闭登录窗口', exact: true }).click()
      await page.getByRole('link', { name: '制作我的个人 Tier 榜', exact: true }).click()
      await expect(page).toHaveURL(/\/tiers\/mine$/)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  }
})
