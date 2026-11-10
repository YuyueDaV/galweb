import { test, expect } from '@playwright/test'

test('公开提名署名、匿名分数、二次投票与归档书单完整流程', async ({ page, browser }) => {
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
    await page.getByRole('button', { name: '活动设置', exact: true }).click()
    await page.getByRole('button', { name: '归档本届活动', exact: true }).click()
    await page.getByRole('button', { name: '确认推进', exact: true }).click()
    await expect(page.locator('.award-stage-management li.active')).toContainText('已归档')
    await visitor.reload()
    await expect(visitor.locator('.ranking-hero')).toContainText(`第 ${publicState.campaign.edition} 届`)
    await expect(visitor.locator('.ranking-subtitle')).toHaveText('3 部作品，3 种难以忘记的感动。')
    await expect(visitor.locator('.rank-feature')).toHaveCount(3)
    await expect(visitor.locator('.rank-feature').first()).toContainText(titles[0])
    await expect(visitor.locator('.rank-feature').first()).toContainText('首轮公开署名推荐词')
    await expect(visitor.locator('.rank-feature').first()).toContainText('4 分')
    await expect(visitor.locator('.rank-feature').first()).toHaveAttribute(
      'href',
      `/works/${publicState.results.find((r: { id: string }) => r.id === a).coverRank}`,
    )
    await expect(visitor.locator('.award-stepper')).toHaveCount(0)
    await expect(visitor.locator('.award-hero')).toHaveCount(0)
    await expect(visitor.locator('.award-candidate-card').first()).not.toBeVisible()
    await visitor.locator('.award-archive-records > summary').click()
    await expect(visitor.locator('.award-candidate-card')).toHaveCount(3)
    await expect(visitor.locator('.award-candidate-card').first()).toBeVisible()
    await visitor.getByRole('button', { name: '我的选票', exact: true }).click()
    await expect(visitor.getByRole('button', { name: '保存选票修改', exact: true })).toBeDisabled()
    await expect(visitor.getByRole('button', { name: '撤回选票', exact: true })).toBeDisabled()
    await visitor.locator('.award-archive-records > summary').click()
    for (const width of [1440, 390]) {
      await visitor.setViewportSize({ width, height: 1000 })
      expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await visitor.screenshot({ path: test.info().outputPath(`award-archive-${width}.png`), fullPage: true })
    }
    await visitor.getByLabel('选择活动届次').selectOption('browser-voting')
    await expect(visitor.locator('.award-hero')).toBeVisible()
    await visitor.getByLabel('选择活动届次').selectOption(id)
    await expect(visitor).toHaveURL(new RegExp('campaign=' + id))
    await expect(visitor.locator('.ranking-hero')).toBeVisible()
    await visitor.reload()
    await expect(visitor.getByLabel('选择活动届次')).toHaveValue(id)
    await expect(visitor.locator('.ranking-hero')).toBeVisible()
    await visitor.getByLabel('选择活动届次').click()
    const editionPicker = visitor.getByRole('dialog', { name: '选择活动届次', exact: true })
    const firstEdition = editionPicker.getByRole('option', { name: '第 1 届 · 已归档', exact: true })
    await firstEdition.scrollIntoViewIfNeeded()
    await expect(firstEdition).toBeVisible()
    await editionPicker.screenshot({ path: test.info().outputPath('award-edition-picker-mobile.png') })
    await firstEdition.click()
    await expect(visitor).toHaveURL(/\/ranking$/)
    await expect(visitor.locator('.ranking-hero')).toContainText('第一届澄之响')
    await expect(visitor.locator('.rank-feature, .rank-row')).toHaveCount(12)
    await expect(visitor.getByLabel('选择活动届次')).toHaveValue('orange-awards-1')
    await expect(visitor.getByLabel('选择活动届次').locator('option[value="orange-awards-1"]')).toHaveCount(1)
    await visitor.reload()
    await expect(visitor.getByLabel('选择活动届次')).toHaveValue('orange-awards-1')
    await visitor.getByLabel('选择活动届次').selectOption(id)
    await expect(visitor.getByLabel('选择活动届次')).toHaveValue(id)
    await expect(visitor.locator('.rank-feature')).toHaveCount(3)
  } finally {
    await member.close()
  }
})
