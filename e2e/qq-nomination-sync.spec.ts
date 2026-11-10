import { test, expect } from '@playwright/test'

test('第二届QQ群提名人日期编辑：手机弹窗、前台署名和其他届次隔离', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
  const second = (await (await page.request.get('/api/award-campaigns')).json()).find(
    (campaign: { edition: number }) => campaign.edition === 2,
  )
  const state = await (await page.request.get('/api/award-campaigns/' + second.id)).json()
  const nomination = state.nominations[0]
  const endpoint = '/api/admin/award-campaigns/' + second.id + '/qq-nominations/' + nomination.id
  await page.goto('/admin/awards')
  await page.getByLabel('当前活动').selectOption(second.id)
  await page.getByRole('button', { name: '提名审核', exact: true }).click()
  await page.getByLabel('审核记录筛选').selectOption('all')
  const record = page.locator('.award-review-list article').filter({ hasText: nomination.title })
  await page.setViewportSize({ width: 390, height: 844 })
  await record.getByRole('button', { name: '同步提名人和日期', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '同步提名人和日期', exact: true })
  const displayName = '群友实际提名人 ' + Date.now().toString(36)
  await dialog.getByLabel('QQ群提名人', { exact: true }).fill(displayName)
  await dialog.getByLabel('实际提名时间（北京时间）', { exact: true }).fill('2026-11-02T20:15')
  await page.route('**' + endpoint, (route) =>
    route.fulfill({ status: 503, json: { message: '测试同步失败，请重试。' } }),
  )
  await dialog.getByRole('button', { name: '保存QQ群提名信息', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('测试同步失败')
  await expect(dialog.getByLabel('QQ群提名人', { exact: true })).toHaveValue(displayName)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await dialog.screenshot({ path: test.info().outputPath('qq-sync-mobile.png') })
  await page.unroute('**' + endpoint)
  await dialog.getByRole('button', { name: '保存QQ群提名信息', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(record).toContainText(displayName)
  await expect(record).toContainText('2026/11/02 20:15')
  await expect(record).toContainText('原网站提交：' + nomination.accountName)
  expect(
    (
      await page.request.patch(endpoint, {
        headers: { Origin: origin },
        data: {
          nominatorName: displayName,
          nominatedAt: '2026-11-02T12:15:00Z',
          revision: nomination.qqSyncRevision,
        },
      })
    ).status(),
  ).toBe(403)
  const anonymous = await browser.newContext({ baseURL: origin })
  try {
    const reader = await anonymous.newPage()
    await reader.goto('/awards?campaign=' + second.id)
    const candidate = reader.locator('.award-candidate-card').filter({ hasText: nomination.title })
    await expect(candidate).toContainText(displayName)
    await candidate.locator('.award-public-details summary').first().click()
    await expect(candidate).toContainText('2026/11/02 20:15')
  } finally {
    await anonymous.close()
  }
  const later = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  await page.getByLabel('当前活动').selectOption('browser-voting')
  await expect(page.locator('.qq-sync-help')).toHaveCount(0)
  expect(
    (
      await page.request.patch(
        '/api/admin/award-campaigns/' + later.id + '/qq-nominations/' + nomination.id,
        {
          headers,
          data: {
            nominatorName: displayName,
            nominatedAt: '2026-11-02T12:15:00Z',
            revision: nomination.qqSyncRevision,
          },
        },
      )
    ).status(),
  ).toBe(403)
})
