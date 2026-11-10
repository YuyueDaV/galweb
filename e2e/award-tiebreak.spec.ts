import { test, expect } from '@playwright/test'

test('同票阻止公布，连续加赛直到名次唯一，每轮通知并保留原始分数', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_tiebreak_editor', password: 'Isolated editor password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrfToken }
  const api = page.request
  let c = await (await api.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  const id = c.id
  const state = async () => await (await api.get('/api/award-campaigns/' + id)).json()
  expect(
    (await api.patch('/api/admin/award-campaigns/' + id, { headers, data: { ...c, winnerCount: 3 } })).ok(),
  ).toBeTruthy()
  const advance = async (phase: string) => {
    c = (await state()).campaign
    expect(
      (
        await api.post(`/api/admin/award-campaigns/${id}/transitions`, {
          headers,
          data: { phase, version: c.version },
        })
      ).ok(),
    ).toBeTruthy()
  }
  await advance('nomination')
  const marker = Date.now().toString(36)
  const titles = ['甲', '乙', '丙'].map((name) => '加赛作品' + name + marker)
  for (const title of titles)
    expect(
      (
        await api.post(`/api/award-campaigns/${id}/nominations`, {
          headers,
          data: { title, studio: '测试会社', reason: '同票加赛测试' },
        })
      ).ok(),
    ).toBeTruthy()
  const nominations = (await state()).nominations
  for (const n of nominations)
    expect(
      (
        await api.patch(`/api/award-campaigns/${id}/nominations/${n.id}`, {
          headers,
          data: { status: 'approved', note: '' },
        })
      ).ok(),
    ).toBeTruthy()
  const [a, b, cc] = titles.map(
    (title) => nominations.find((item: { title: string }) => item.title === title).candidateId,
  )
  await advance('voting')
  expect(
    (
      await api.put(`/api/award-campaigns/${id}/ballot`, {
        headers,
        data: {
          candidateIds: [a, b, cc],
          weighted: { loveId: a, likeIds: [b, cc], recommendations: [] },
          version: 0,
          round: 1,
        },
      })
    ).ok(),
  ).toBeTruthy()
  const member = await browser.newContext({ baseURL: origin })
  try {
    const signed = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
    })
    expect(signed.ok()).toBeTruthy()
    await page.goto('/admin/awards')
    await page.getByLabel('当前活动').selectOption(id)
    const publish = page.getByRole('button', { name: '结束投票并公布结果', exact: true })
    await expect(publish).toBeDisabled()
    const startTie = async (round: number) => {
      await page.getByRole('button', { name: '开启同票加赛', exact: true }).click()
      await page.getByRole('button', { name: '确认开启同票加赛', exact: true }).click()
      await expect(page.locator('.award-runoff-management')).toContainText(`第 ${round} 轮 · 同票加赛`)
    }
    await startTie(2)
    const visitor = await member.newPage()
    await visitor.setViewportSize({ width: 390, height: 844 })
    await visitor.goto('/awards?campaign=' + id)
    const ballot = visitor.getByRole('region', { name: '同票加赛选票', exact: true })
    await expect(ballot).toBeVisible()
    await expect(visitor.locator('.weighted-ballot')).toHaveCount(0)
    await expect(ballot.locator('select option')).toHaveCount(3)
    await expect(ballot.locator(`option[value="${a}"]`)).toHaveCount(0)
    await ballot.getByLabel('第 2–3 名加赛').selectOption(b)
    await ballot.getByRole('button', { name: '提交加赛选票', exact: true }).click()
    await expect(ballot.getByRole('status')).toContainText('已提交')
    expect(await visitor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await ballot.screenshot({ path: test.info().outputPath('tie-break-ballot-mobile.png') })
    expect(
      (
        await api.put(`/api/award-campaigns/${id}/ballot`, {
          headers,
          data: { candidateIds: [cc], version: 0, round: 2 },
        })
      ).ok(),
    ).toBeTruthy()
    await page.getByRole('button', { name: '刷新投票数据', exact: true }).click()
    await expect(publish).toBeDisabled()
    await startTie(3)
    await visitor.reload()
    await expect(ballot).toContainText('第 3 轮')
    await expect(ballot.getByLabel('第 2–3 名加赛')).toHaveValue('')
    await ballot.getByLabel('第 2–3 名加赛').selectOption(b)
    await ballot.getByRole('button', { name: '提交加赛选票', exact: true }).click()
    await expect(ballot.getByRole('status')).toContainText('已提交')
    await page.getByRole('button', { name: '刷新投票数据', exact: true }).click()
    await expect(publish).toBeEnabled()
    await publish.click()
    await page.getByRole('button', { name: '确认推进', exact: true }).click()
    await expect(page.locator('.award-stage-management li.active')).toContainText('结果公布')
    await page.getByRole('button', { name: '归档本届活动', exact: true }).click()
    await page.getByRole('button', { name: '确认推进', exact: true }).click()
    await expect(page.locator('.award-stage-management li.active')).toContainText('已归档')
    await visitor.reload()
    await expect(visitor.locator('.rank-feature')).toHaveCount(3)
    await expect(visitor.locator('.archive-pending-ties')).toHaveCount(0)
    expect(
      (await visitor.locator('.rank-feature-number').allTextContents()).map((text) =>
        Number(text.trim().slice(0, 2)),
      ),
    ).toEqual([1, 2, 3])
    await expect(visitor.locator('.rank-feature').filter({ hasText: titles[1] })).toContainText('加赛定序')
    const result = await state()
    expect(result.results.map((item: { rank: number }) => item.rank)).toEqual([1, 2, 3])
    expect(result.results.map((item: { votes: number }) => item.votes)).toEqual([2, 1, 1])
    const inbox = await (await member.request.get('/api/notifications')).json()
    expect(
      inbox.items.filter(
        (item: { title: string; link: string }) => item.link.includes(id) && item.title.includes('同票加赛'),
      ),
    ).toHaveLength(2)
  } finally {
    await member.close()
  }
})
