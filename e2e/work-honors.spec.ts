import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test('书架荣誉按届次展示，桌面与手机标记可读，立体书架保持同样信息', async ({ page }) => {
  const works = await (await page.request.get('/api/works')).json()
  works[0].awardHonors = [
    { campaignId: 'second', edition: 2, rank: 2 },
    { campaignId: 'first', edition: 1, rank: 1 },
  ]
  await page.route('**/api/works', (route) => route.fulfill({ json: works }))
  await mkdir('.data/visual-checks', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    // Navigate on the client so the intercepted catalog also covers SSR-enabled pages.
    await page.goto('/')
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '作品书架', exact: true })
      .click()
    await page.setViewportSize({ width, height: 1000 })
    const card = page.locator('.work-card').first()
    await expect(card.getByLabel('第2届十二橙器，第2名', { exact: true })).toBeVisible()
    await expect(card.getByLabel('第1届十二橙器，第1名', { exact: true })).toBeVisible()
    expect(
      await card
        .locator('.work-award-badge strong')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(12)
    await card.screenshot({ path: `.data/visual-checks/award-honors-${width}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.getByRole('button', { name: '立体书架', exact: true }).click()
  await expect(
    page.locator('.shelf-book').first().getByLabel('第2届十二橙器，第2名', { exact: true }),
  ).toBeVisible()
})
