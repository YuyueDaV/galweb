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
    const summary = card.locator('.work-award-summary')
    await expect(summary).toBeVisible()
    await expect(summary).toHaveAttribute('aria-label', '第2届十二橙器第2名，第1届十二橙器第1名')
    expect(
      await summary.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(12)
    if (width === 1440) {
      await summary.hover()
      const options = card.locator('.work-award-options')
      await expect(options).toBeVisible()
      await expect(options).toContainText('第 2 届')
      await expect(options).toContainText('第 1 届')
    }
    await card.screenshot({ path: `.data/visual-checks/award-honors-${width}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  }
  await page.getByRole('button', { name: '立体书架', exact: true }).click()
  const shelfSummary = page.locator('.shelf-book').first().locator('.work-award-summary')
  await expect(shelfSummary).toBeVisible()
  await expect(shelfSummary).toHaveAttribute('aria-label', '第2届十二橙器第2名，第1届十二橙器第1名')
})
