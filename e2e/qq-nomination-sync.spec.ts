import { test, expect } from '@playwright/test'

test('各届多条提名编辑：兼容旧 QQ 数据、批量保存姓名时间提名词和失败提示', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
  const second = (await (await page.request.get('/api/award-campaigns')).json()).find(
    (c: { edition: number }) => c.edition === 2,
  )
  const legacy = (await (await page.request.get('/api/award-campaigns/' + second.id)).json()).nominations[0]
  await page.goto('/admin/awards')
  await page.getByLabel('当前活动').selectOption(second.id)
  await page.getByRole('button', { name: '提名审核', exact: true }).click()
  await page.getByLabel('审核记录筛选').selectOption('all')
  await page
    .locator('.award-review-list article')
    .filter({ hasText: legacy.title })
    .getByRole('button', { name: /编辑本作提名/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: '编辑提名人和提名词', exact: true })
  await expect(dialog.getByLabel('提名人', { exact: true })).toHaveValue(legacy.qqSync.nominatorName)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()

  const campaign = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  expect(campaign.edition).toBeGreaterThan(2)
  expect(
    (
      await page.request.post('/api/admin/award-campaigns/' + campaign.id + '/transitions', {
        headers,
        data: { phase: 'nomination', version: campaign.version },
      })
    ).ok(),
  ).toBeTruthy()
  const title = '批量编辑作品 ' + Date.now()
  const endpoint = '/api/award-campaigns/' + campaign.id + '/nominations'
  const first = await (
    await page.request.post(endpoint, {
      headers,
      data: { title, studio: '测试会社', reason: '网站原始说明甲' },
    })
  ).json()
  const member = await browser.newContext({ baseURL: origin })
  try {
    const login = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_auth', password: 'Isolated moderator password 123!' },
    })
    const memberHeaders = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrfToken }
    const secondRecord = await (
      await member.request.post(endpoint, {
        headers: memberHeaders,
        data: { title, studio: '', reason: '网站原始说明乙' },
      })
    ).json()
    for (const nomination of [first, secondRecord])
      expect(
        (
          await page.request.patch(endpoint + '/' + nomination.id, { headers, data: { status: 'approved' } })
        ).ok(),
      ).toBeTruthy()
    await page.goto('/admin/awards')
    await page.getByLabel('当前活动').selectOption(campaign.id)
    await page.getByRole('button', { name: '提名审核', exact: true }).click()
    await page.getByLabel('审核记录筛选').selectOption('all')
    const records = page.locator('.award-review-list article').filter({ hasText: title })
    await records.first().getByRole('button', { name: '编辑本作提名（2 条）', exact: true }).click()
    const rows = dialog.locator('fieldset')
    await expect(rows).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      await rows
        .nth(i)
        .getByLabel('提名人', { exact: true })
        .fill('实际提名人' + i)
      await rows
        .nth(i)
        .getByLabel('实际提名时间（北京时间）', { exact: true })
        .fill('2026-11-02T20:1' + i)
      await rows
        .nth(i)
        .getByLabel('提名词', { exact: true })
        .fill('分别填写的提名词' + i)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const updatePath = '/api/admin/award-campaigns/' + campaign.id + '/nomination-details'
    await page.route('**' + updatePath, (route) =>
      route.fulfill({ status: 503, json: { message: '测试保存失败，请重试。' } }),
    )
    await dialog.getByRole('button', { name: '保存全部修改', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('测试保存失败')
    await expect(rows.nth(1).getByLabel('提名词', { exact: true })).toHaveValue('分别填写的提名词1')
    await dialog.screenshot({ path: test.info().outputPath('nomination-details-mobile.png') })
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    }
    await dialog.screenshot({ path: test.info().outputPath('nomination-details-desktop.png') })
    await page.unroute('**' + updatePath)
    await dialog.getByRole('button', { name: '保存全部修改', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    for (let i = 0; i < 2; i++) {
      await expect(records.filter({ hasText: '实际提名人' + i })).toContainText('分别填写的提名词' + i)
      await expect(records.filter({ hasText: '实际提名人' + i })).toContainText('2026/11/02 20:1' + i)
    }
    expect(
      (await page.request.patch(updatePath, { headers: { Origin: origin }, data: { entries: [] } })).status(),
    ).toBe(403)
    const state = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
    expect(state.nominations.map((n: { reason: string }) => n.reason).sort()).toEqual(
      ['网站原始说明乙', '网站原始说明甲'].sort(),
    )
    const reader = await member.newPage()
    await reader.goto('/awards?campaign=' + campaign.id)
    const card = reader.locator('.award-candidate-card').filter({ hasText: title })
    await expect(card).toContainText('实际提名人0')
    await expect(card).toContainText('实际提名人1')
    await card.locator('.award-public-details summary').first().click()
    for (let i = 0; i < 2; i++) await expect(card).toContainText('分别填写的提名词' + i)
  } finally {
    await member.close()
  }
})
