import { test, expect } from '@playwright/test'
import { mkdir, readdir, readFile } from 'node:fs/promises'

test('桌面与手机导航、深色模式、按需书架、图片故障与减少动画', async ({ page }, info) => {
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/works')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.getByRole('button', { name: '展开社区导航', exact: true }).click()
  await expect(page.getByRole('button', { name: '展开社区导航', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await page
    .getByRole('complementary', { name: '社区导航' })
    .getByRole('link', { name: '社区广场', exact: true })
    .click()
  await expect(page.getByRole('button', { name: '展开社区导航', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page.getByRole('button', { name: '打开搜索', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '搜索帖子和作品' })).toBeFocused()
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click()
  await page.getByRole('button', { name: '切换深色模式' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: '切换浅色模式' }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/images/works/**', (route) => route.abort())
  await page.goto('/works')
  await expect(page.locator('.image-fallback').first()).toBeVisible()
  await page.getByRole('button', { name: '立体书架', exact: true }).click()
  await expect(page.getByLabel('立体作品书架')).toBeVisible()
  expect(
    await page
      .locator('.shelf-book-object')
      .first()
      .evaluate((el) => getComputedStyle(el).transform),
  ).toBe('none')
  await expect(page.locator('.shelf-book-title')).toHaveCount(12)
  await page.screenshot({ path: info.outputPath('image-fallback-and-reduced-motion.png') })
  await page.unroute('**/images/works/**')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/works')
  await page.getByRole('button', { name: '立体书架', exact: true }).click()
  const shelf = page.getByLabel('立体作品书架')
  await expect(shelf).toBeVisible()
  // This layout is supplied by prefixed Tailwind utilities, not the legacy stylesheet.
  expect(
    await shelf
      .locator('.shelf-book')
      .first()
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe('flex')
  for (const image of await shelf.locator('img').all()) {
    await image.scrollIntoViewIfNeeded()
    await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  }
  await mkdir('.data/visual-checks', { recursive: true })
  await shelf.locator('.shelf-book').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: '.data/visual-checks/bookshelf-foundations.png' })
})

test('立体效果脚本加载失败时仍能返回普通书架', async ({ page }) => {
  const directory = 'apps/web/.output-check/public/_nuxt'
  let chunk = ''
  for (const name of await readdir(directory)) {
    if (
      name.endsWith('.js') &&
      (await readFile(directory + '/' + name, 'utf8')).includes('shelf-book-object')
    )
      chunk = name
  }
  expect(chunk).not.toBe('')
  await page.route('**/_nuxt/' + chunk, (route) => route.abort())
  await page.goto('/works')
  await expect(page.locator('.works-grid')).toBeVisible()
  await page.getByRole('button', { name: '立体书架', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('立体书架暂时未能加载')
  await page.getByRole('button', { name: '返回卡片列表', exact: true }).click()
  await expect(page.locator('.works-grid')).toBeVisible()
  await expect(page.locator('.works-grid .work-card')).toHaveCount(12)
})
