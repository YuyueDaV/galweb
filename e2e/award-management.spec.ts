import { test, expect } from '@playwright/test'

test('管理员创建修改删除活动；自定义分值、互斥选票、推荐词加分及结果', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrfToken }
  await page.goto('/admin/awards')
  await expect(page.getByLabel('当前活动')).toBeVisible()
  const existingCampaigns = await (await page.request.get('/api/award-campaigns')).json()
  const usedEditions = new Set(existingCampaigns.map((item: { edition: number }) => item.edition))
  const edition = Array.from({ length: 99 }, (_, index) => index + 1).find(
    (value) => !usedEditions.has(value),
  )!
  expect(edition).toBeDefined()
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/award-campaigns') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '新建一届', exact: true }).click()
  const createDialog = page.getByRole('dialog', { name: '新建一届活动', exact: true })
  await createDialog.getByRole('spinbutton', { name: /活动届数/ }).fill(String(edition))
  await createDialog.getByRole('button', { name: '创建草稿', exact: true }).click()
  const campaign = await (await created).json(),
    id = campaign.id
  expect(campaign.edition).toBe(edition)
  await expect(page.getByLabel('当前活动')).toHaveValue(id)
  await expect(page.getByLabel('真爱票张数', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('喜爱票张数', { exact: true })).toHaveValue('2')
  await page.setViewportSize({ width: 390, height: 844 })
  const rules = page.getByRole('group', { name: '自定义投票规则', exact: true })
  await expect(rules).toBeVisible()
  expect(
    await rules
      .locator('input')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(48)
  expect(
    await rules
      .locator('label')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(14)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await rules.screenshot({ path: test.info().outputPath('award-rules-mobile.png') })
  await page.setViewportSize({ width: 1440, height: 900 })
  const title = '自定义加分活动 ' + Date.now().toString(36)
  await page.getByLabel('活动名称', { exact: true }).fill(title)
  await page.getByLabel('计划入选作品', { exact: true }).fill('3')
  await page.getByLabel('真爱票分值', { exact: true }).fill('5')
  await page.getByLabel('每份推荐词加分', { exact: true }).fill('4')
  await page.getByRole('button', { name: '保存活动设置', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存活动设置', exact: true })).toBeDisabled()
  const api = page.request
  const state = async () => await (await api.get('/api/award-campaigns/' + id)).json()
  let current = await state()
  expect(current.campaign.ballotRules.lovePoints).toBe(5)
  const advance = async (phase: string) => {
    current = await state()
    const r = await api.post('/api/admin/award-campaigns/' + id + '/transitions', {
      headers,
      data: { phase, version: current.campaign.version },
    })
    expect(r.ok()).toBeTruthy()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '开放提名', exact: true }).click()
  const phaseConfirm = page.locator('.award-phase-confirm')
  await expect(phaseConfirm.getByRole('button', { name: '取消', exact: true })).toBeVisible()
  await phaseConfirm.screenshot({ path: test.info().outputPath('phase-confirm-mobile.png') })
  await phaseConfirm.getByRole('button', { name: '取消', exact: true }).click()
  await expect(phaseConfirm).toHaveCount(0)
  await page.getByRole('button', { name: '开放提名', exact: true }).click()
  await phaseConfirm.getByRole('button', { name: '确认推进', exact: true }).click()
  await expect(page.locator('.award-stage-management li.active')).toContainText('提名阶段')
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const name of ['甲', '乙', '丙'])
    expect(
      (
        await api.post('/api/award-campaigns/' + id + '/nominations', {
          headers,
          data: { title: '活动测试作品' + name, studio: '', reason: '' },
        })
      ).ok(),
    ).toBeTruthy()
  current = await state()
  for (const n of current.nominations)
    expect(
      (
        await api.patch('/api/award-campaigns/' + id + '/nominations/' + n.id, {
          headers,
          data: { status: 'approved', note: '' },
        })
      ).ok(),
    ).toBeTruthy()
  await advance('voting')
  const member = await browser.newContext({ baseURL: origin })
  try {
    const signed = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
    })
    const memberHeaders = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
    const visitor = await member.newPage()
    await visitor.goto('/awards?campaign=' + id)
    const nominations = current.nominations,
      first = nominations[0],
      second = nominations[1],
      third = nominations[2]
    await visitor.getByLabel(/真爱票 1/).selectOption(first.candidateId)
    await expect(
      visitor.getByLabel(/喜爱票 1/).locator('option[value="' + first.candidateId + '"]'),
    ).toHaveJSProperty('disabled', true)
    await visitor.getByLabel(/喜爱票 1/).selectOption(second.candidateId)
    await visitor.getByLabel(/喜爱票 2/).selectOption(third.candidateId)
    await visitor.getByLabel('给《' + first.title + '》的推荐词 · 选填').fill('投给真爱作品的额外推荐词。')
    await expect(visitor.locator('.ballot-score')).toContainText('11 分')
    await visitor.getByRole('button', { name: '提交我的选票', exact: true }).click()
    await expect(visitor.locator('.weighted-ballot [role=status]')).toContainText('已提交')
    await visitor.reload()
    await expect(visitor.getByLabel(/真爱票 1/)).toHaveValue(first.candidateId)
    expect(
      (
        await member.request.delete('/api/admin/award-campaigns/' + id, {
          headers: memberHeaders,
          data: { confirmation: title, version: 0 },
        })
      ).status(),
    ).toBe(403)
    current = await state()
    expect(
      (
        await api.post('/api/admin/award-campaigns/' + id + '/transitions', {
          headers,
          data: { phase: 'results', version: current.campaign.version },
        })
      ).status(),
    ).toBe(409)
    expect(
      (
        await api.post('/api/admin/award-campaigns/' + id + '/tie-break', {
          headers,
          data: { version: current.campaign.version },
        })
      ).ok(),
    ).toBeTruthy()
    current = await state()
    expect(
      (
        await member.request.put('/api/award-campaigns/' + id + '/ballot', {
          headers: memberHeaders,
          data: { candidateIds: [second.candidateId], version: 0, round: current.campaign.votingRound },
        })
      ).ok(),
    ).toBeTruthy()
    await advance('results')
    current = await state()
    expect(current.results.find((r: { id: string }) => r.id === first.candidateId).votes).toBe(9)
    expect(current.results.find((r: { id: string }) => r.id === second.candidateId).votes).toBe(1)
    await page.reload()
    await page.getByLabel('当前活动').selectOption(id)
    await expect(page.getByLabel('当前活动')).toHaveValue(id)
    await page.getByRole('button', { name: '删除本届活动', exact: true }).click()
    await page.getByLabel('输入活动名称确认删除').fill('错误名称')
    await expect(page.getByRole('button', { name: '确认删除活动', exact: true })).toBeDisabled()
    await page.getByLabel('输入活动名称确认删除').fill(title.replace(/\s+/g, ''))
    await expect(page.getByRole('button', { name: '确认删除活动', exact: true })).toBeEnabled()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByLabel('输入活动名称确认删除').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await page
      .locator('.campaign-delete-zone')
      .screenshot({ path: test.info().outputPath('delete-mobile.png') })
    await page.getByRole('button', { name: '切换深色模式' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByLabel('输入活动名称确认删除').scrollIntoViewIfNeeded()
    await page
      .locator('.campaign-delete-zone')
      .screenshot({ path: test.info().outputPath('delete-mobile-dark.png') })
    await page.route('**/api/admin/award-campaigns/' + id, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      await route.fulfill({
        status: 404,
        json: { message: 'Cannot DELETE /api/admin/award-campaigns/' + id },
      })
    })
    await page.getByRole('button', { name: '确认删除活动', exact: true }).click()
    await expect(page.locator('.campaign-delete-zone [role=alert]')).toContainText('更新并重启后端')
    await expect(page.getByRole('button', { name: '确认删除活动', exact: true })).toBeEnabled()
    await page.unroute('**/api/admin/award-campaigns/' + id)
    await page.getByRole('button', { name: '确认删除活动', exact: true }).click()
    await expect(page.getByLabel('当前活动')).not.toHaveValue(id)
    expect((await api.get('/api/award-campaigns/' + id)).status()).toBe(404)
    await visitor.setViewportSize({ width: 390, height: 844 })
    await visitor.goto('/awards')
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  } finally {
    await member.close()
    const remaining = await api.get('/api/award-campaigns/' + id)
    if (remaining.ok()) {
      const c = (await remaining.json()).campaign
      await api.delete('/api/admin/award-campaigns/' + id, {
        headers,
        data: { version: c.version, confirmation: c.title },
      })
    }
  }
})
