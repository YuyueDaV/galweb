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
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/admin/award-campaigns') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '新建一届', exact: true }).click()
  const campaign = await (await created).json(),
    id = campaign.id
  await expect(page.getByLabel('当前活动')).toHaveValue(id)
  await expect(page.getByLabel('真爱票张数', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('喜爱票张数', { exact: true })).toHaveValue('2')
  const title = '自定义加分活动 ' + Date.now().toString(36)
  await page.getByLabel('活动名称', { exact: true }).fill(title)
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
  await advance('nomination')
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
    await advance('results')
    current = await state()
    expect(current.results.find((r: { id: string }) => r.id === first.candidateId).votes).toBe(9)
    expect(current.results.find((r: { id: string }) => r.id === second.candidateId).votes).toBe(1)
    await page.reload()
    await expect(page.getByLabel('当前活动')).toHaveValue(id)
    await page.getByRole('button', { name: '删除本届活动', exact: true }).click()
    await page.getByLabel('输入活动名称确认删除').fill('错误名称')
    await expect(page.getByRole('button', { name: '确认删除活动', exact: true })).toBeDisabled()
    await page.getByLabel('输入活动名称确认删除').fill(title)
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
