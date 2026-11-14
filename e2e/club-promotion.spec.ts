import { test, expect } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

test('同好会宣传：原始素材、复制及失败提示、二维码放大保存、手机布局', async ({ page, context }) => {
  const origin = 'http://127.0.0.1:3117'
  await mkdir('.data/visual-checks', { recursive: true })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await page.goto('/')
  const compact = page.locator('.club-promotion--compact')
  await expect(compact).toContainText('348083428')
  await expect
    .poll(() =>
      compact.locator('.club-promotion-logo').evaluate((image) => (image as HTMLImageElement).currentSrc),
    )
    .toMatch(/-128\.webp$/)
  await compact.screenshot({ path: '.data/visual-checks/club-home-card.png' })
  await compact.getByRole('button', { name: '复制群号', exact: true }).click()
  await expect(compact.getByRole('status')).toContainText('群号已复制')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('348083428')
  await compact.getByRole('button', { name: '查看入群二维码', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '澄之响 QQ 群入群二维码', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('img')).toHaveJSProperty('naturalWidth', 1284)
  await expect(dialog.locator('img')).toHaveJSProperty('naturalHeight', 2283)
  const imageUrl = await dialog.locator('img').getAttribute('src')
  const response = await page.request.get(imageUrl!)
  expect(response.ok()).toBeTruthy()
  expect(
    createHash('sha256')
      .update(await response.body())
      .digest('hex'),
  ).toBe('3b7306f3d2c4df5b0fd59f65ce8381b287410637c2df0f4cf35637f7f4c5afc5')
  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('link', { name: '保存入群图片', exact: true }).click()
  const download = await downloadEvent
  const path = await download.path()
  expect(
    createHash('sha256')
      .update(await readFile(path!))
      .digest('hex'),
  ).toBe('3b7306f3d2c4df5b0fd59f65ce8381b287410637c2df0f4cf35637f7f4c5afc5')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(compact.getByRole('button', { name: '查看入群二维码', exact: true })).toBeFocused()

  await page.goto('/about#join-club')
  const promotion = page.locator('#join-club')
  await expect(promotion).toContainText('348083428')
  await expect
    .poll(() => page.locator('.about-club-logo').evaluate((image) => (image as HTMLImageElement).currentSrc))
    .toMatch(/-256\.webp$/)
  await expect(page.getByText('入社方式与活动安排待管理员公布。', { exact: true })).toHaveCount(0)
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new Error('Clipboard denied for test')
      },
    }),
  )
  await promotion.getByRole('button', { name: '复制群号', exact: true }).click()
  await expect(promotion.getByRole('alert')).toContainText('复制失败，请手动复制群号：348083428')
  await promotion.getByRole('button', { name: '放大 QQ 群入群二维码', exact: true }).click()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '关闭入群二维码', exact: true }).click()
  await expect(dialog).not.toBeVisible()

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/about#join-club')
    if (width === 390) await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    await promotion.getByRole('button', { name: '查看入群二维码', exact: true }).click()
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `.data/visual-checks/club-qr-${width}.png` })
    await page.keyboard.press('Escape')
    await promotion.screenshot({ path: `.data/visual-checks/club-promotion-${width}.png` })
  }
})
