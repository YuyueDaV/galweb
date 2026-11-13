import { test, expect } from '@playwright/test'

test('超级管理员可重复超额提名，Bangumi 会社补全后入库，普通账号仍受限', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_owner_other', password: 'Isolated moderator password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  const signed = await login.json()
  expect(signed.user.role).toBe('super_admin')
  const headers = { Origin: origin, 'X-CSRF-Token': signed.csrfToken }
  const title = '可补全会社 ' + Date.now()
  const work = await (await page.request.post('/api/works', { headers, data: { title, studio: '' } })).json()
  const campaign = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  const now = Date.now()
  const settings = await page.request.patch('/api/admin/award-campaigns/' + campaign.id, {
    headers,
    data: {
      ...campaign,
      nominationLimit: 1,
      nominationStart: new Date(now - 86400000).toISOString(),
      nominationEnd: new Date(now + 86400000).toISOString(),
      votingStart: new Date(now + 86400000).toISOString(),
      votingEnd: new Date(now + 2 * 86400000).toISOString(),
    },
  })
  expect(settings.ok()).toBeTruthy()
  const current = (await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()).campaign
  expect(
    (
      await page.request.post('/api/admin/award-campaigns/' + campaign.id + '/transitions', {
        headers,
        data: { phase: 'nomination', version: current.version },
      })
    ).ok(),
  ).toBeTruthy()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/awards?campaign=' + campaign.id)
  const dialog = page.getByRole('dialog', { name: '替喜欢的作品，写一封推荐信。', exact: true })
  await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
  await expect(dialog.locator('.nomination-owner-help')).toContainText('可重复提名同一作品')
  await dialog.getByRole('combobox', { name: '作品来源', exact: true }).selectOption('bangumi')
  let subject = {
    id: 998501,
    title,
    originalTitle: title,
    studio: '识别到的会社',
    summary: '',
    coverUrl: '',
    score: null,
    ratingCount: 0,
    tags: [],
    date: '',
    syncedAt: Date.now(),
  }
  await page.route('**/api/bangumi/search?*', (route) =>
    route.fulfill({ json: { items: [subject], total: 1, page: 1 } }),
  )
  await dialog.getByLabel('Bangumi 作品名称', { exact: true }).fill(title)
  await dialog.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
  await dialog.getByRole('button', { name: '选择此作品提名', exact: true }).click()
  const studio = dialog.getByPlaceholder('例如：Key、TYPE-MOON')
  await expect(studio).toBeEditable()
  await studio.fill('用户补全会社')
  await dialog.getByRole('button', { name: '提交提名', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const completed = await (await page.request.get('/api/works/' + work.rank)).json()
  expect(completed.studio).toBe('用户补全会社')
  expect(completed.addedBy.id).toBe(work.addedBy.id)
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
    await dialog.getByRole('combobox', { name: '书库作品', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '书库作品', exact: true })
    await picker.getByLabel('搜索选项').fill(title)
    await picker.getByRole('option', { name: title + ' · 用户补全会社', exact: true }).click()
    await dialog.getByRole('button', { name: '提交提名', exact: true }).click()
    await expect(dialog).not.toBeVisible()
  }
  const state = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
  expect(state.nominations).toHaveLength(3)
  expect(new Set(state.nominations.map((n: { candidateId: string }) => n.candidateId)).size).toBe(1)
  expect(state.nominations.every((n: { status: string }) => n.status === 'pending')).toBeTruthy()
  await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
  await dialog.getByRole('combobox', { name: '作品来源', exact: true }).selectOption('bangumi')
  subject = {
    ...subject,
    id: 998502,
    title: '未收录的新作品 ' + Date.now(),
    originalTitle: 'NEW ' + Date.now(),
  }
  await dialog.getByLabel('Bangumi 作品名称', { exact: true }).fill(subject.title)
  await dialog.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
  await dialog.getByRole('button', { name: '选择此作品提名', exact: true }).click()
  await expect(studio).toBeEditable()
  await studio.fill('自定义新作品会社')
  await expect(dialog.locator('.award-form-bottom')).toContainText('已提交 3 条提名')
  await dialog.screenshot({ path: test.info().outputPath('super-admin-bangumi-mobile.png') })
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  }
  await dialog.screenshot({ path: test.info().outputPath('super-admin-bangumi-desktop.png') })
  await dialog.getByRole('button', { name: '关闭提名窗口', exact: true }).click()
  const member = await browser.newContext({ baseURL: origin })
  try {
    const login = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_auth', password: 'Isolated moderator password 123!' },
    })
    const data = await login.json(),
      memberHeaders = { Origin: origin, 'X-CSRF-Token': data.csrfToken }
    const endpoint = '/api/award-campaigns/' + campaign.id + '/nominations'
    const input = { title, studio: '', reason: '', workId: work.rank }
    expect((await member.request.post(endpoint, { headers: memberHeaders, data: input })).ok()).toBeTruthy()
    const denied = await member.request.post(endpoint, { headers: memberHeaders, data: input })
    expect(denied.status()).toBe(409)
    expect((await denied.json()).message).toContain('提名上限')
    const visitor = await member.newPage()
    await visitor.goto('/awards?campaign=' + campaign.id)
    await visitor.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
    await expect(visitor.locator('.nomination-owner-help')).toHaveCount(0)
    await expect(visitor.locator('.award-form-bottom')).toContainText('已提名 1 / 1 部')
  } finally {
    await member.close()
  }
})
