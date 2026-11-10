import { test, expect } from '@playwright/test'

test('公开提名署名、匿名分数和管理员二次投票完整流程', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
  const member = await browser.newContext({ baseURL: origin })
  try {
    const login = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
    })
    const memberHeaders = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrfToken }
    const api = page.request
    let c = await (await api.post('/api/admin/award-campaigns', { headers, data: {} })).json()
    const id = c.id
    const state = async () => await (await api.get('/api/award-campaigns/' + id)).json()
    expect(
      (await api.patch('/api/admin/award-campaigns/' + id, { headers, data: { ...c, winnerCount: 3 } })).ok(),
    ).toBeTruthy()
    c = (await state()).campaign
    expect(
      (
        await api.post('/api/admin/award-campaigns/' + id + '/transitions', {
          headers,
          data: { phase: 'nomination', version: c.version },
        })
      ).ok(),
    ).toBeTruthy()
    const marker = Date.now().toString(36)
    const titles = ['甲', '乙', '丙'].map((name) => '补投作品' + name + marker)
    for (const title of titles)
      expect(
        (
          await member.request.post('/api/award-campaigns/' + id + '/nominations', {
            headers: memberHeaders,
            data: { title, studio: '测试会社', reason: '公开的提名说明' },
          })
        ).ok(),
      ).toBeTruthy()
    expect(
      (
        await api.post('/api/award-campaigns/' + id + '/nominations', {
          headers,
          data: { title: titles[0], studio: '', reason: '' },
        })
      ).ok(),
    ).toBeTruthy()
    const visitor = await member.newPage()
    await visitor.setViewportSize({ width: 390, height: 844 })
    await visitor.goto('/awards?campaign=' + id)
    const first = visitor.locator('.award-candidate-card').filter({ hasText: titles[0] })
    await expect(first).toContainText('browser_member')
    await expect(first).toContainText('测试编辑')
    await expect(first).toContainText('2 次提名')
    expect((await first.boundingBox())!.width).toBeGreaterThan(300)
    const current = await state()
    for (const n of current.nominations)
      expect(
        (
          await api.patch('/api/award-campaigns/' + id + '/nominations/' + n.id, {
            headers,
            data: { status: 'approved', note: '' },
          })
        ).ok(),
      ).toBeTruthy()
    expect(
      (
        await api.post('/api/admin/award-campaigns/' + id + '/transitions', {
          headers,
          data: { phase: 'voting', version: current.campaign.version },
        })
      ).ok(),
    ).toBeTruthy()
    await visitor.reload()
    const a = current.nominations.find((n: { title: string }) => n.title === titles[0]).candidateId
    const b = current.nominations.find((n: { title: string }) => n.title === titles[1]).candidateId
    const cc = current.nominations.find((n: { title: string }) => n.title === titles[2]).candidateId
    await visitor.getByLabel(/真爱票 1/).selectOption(a)
    await visitor.getByLabel('给《' + titles[0] + '》的推荐词 · 选填').fill('首轮公开署名推荐词')
    await visitor.getByRole('button', { name: '提交我的选票', exact: true }).click()
    await expect(first.locator('.award-live-score')).toContainText('4 分')
    await first.getByText('查看署名推荐词（1）', { exact: true }).click()
    await expect(first).toContainText('首轮公开署名推荐词')
    await first.screenshot({ path: test.info().outputPath('public-score-recommendation-mobile.png') })
    await page.goto('/admin/awards')
    await page.getByLabel('当前活动').selectOption(id)
    await expect(page.getByRole('heading', { name: '1 · 提名设置', exact: true })).toBeVisible()
    expect((await page.getByRole('heading', { name: '1 · 提名设置' }).boundingBox())!.y).toBeLessThan(
      (await page.getByRole('heading', { name: '2 · 投票设置' }).boundingBox())!.y,
    )
    await expect(page.getByRole('button', { name: '结束投票并公布结果', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '开启二次投票', exact: true }).click()
    await page.getByRole('button', { name: '确认开启二次投票', exact: true }).click()
    await expect(page.locator('.award-runoff-management')).toContainText('第 2 轮')
    await visitor.reload()
    await expect(visitor.getByRole('heading', { name: '二次投票 · 补足入选名额', exact: true })).toBeVisible()
    expect(
      await visitor
        .getByLabel(/真爱票 1/)
        .locator('option')
        .count(),
    ).toBe(3)
    await expect(visitor.getByLabel(/真爱票 1/).locator('option[value="' + a + '"]')).toHaveCount(0)
    await visitor.getByLabel(/真爱票 1/).selectOption(b)
    await visitor.getByRole('button', { name: '刷新分数', exact: true }).click()
    await expect(visitor.getByLabel(/真爱票 1/)).toHaveValue(b)
    await visitor.getByLabel(/喜爱票 1/).selectOption(cc)
    await visitor.getByRole('button', { name: '提交我的选票', exact: true }).click()
    await expect(visitor.getByRole('region', { name: '投票进度', exact: true })).toContainText('3 / 3')
    await expect(first.locator('.award-live-score')).toContainText('4 分')
    await page.getByRole('button', { name: '刷新投票数据', exact: true }).click()
    await expect(page.getByRole('button', { name: '结束投票并公布结果', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '结束投票并公布结果', exact: true }).click()
    await page.getByRole('button', { name: '确认推进', exact: true }).click()
    await page.getByRole('button', { name: '投票数据', exact: true }).click()
    await expect(page.locator('.award-data-panel')).toContainText('全部选票 · 2 条')
    const records = page.locator('.award-data-panel > .award-ballot-record')
    await records.first().locator('summary').click()
    await expect(records.first()).toContainText('browser_member')
    await expect(records.first()).toContainText('真爱票')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    await page
      .locator('.award-data-panel')
      .screenshot({ path: test.info().outputPath('admin-voting-data-mobile.png') })
    await visitor.reload()
    await expect(visitor.locator('.award-result-row')).toHaveCount(3)
    const publicState = await (await member.request.get('/api/award-campaigns/' + id)).json()
    expect(publicState.ballots).toBeUndefined()
    expect(publicState.rounds).toBeUndefined()
  } finally {
    await member.close()
  }
})
