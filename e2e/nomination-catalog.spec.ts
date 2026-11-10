import { test, expect } from '@playwright/test'

test('提名使用实时书库，Bangumi 复用已有作品，手动收录记录添加人', async ({ page }) => {
  const origin = 'http://127.0.0.1:3117'
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  const signed = await login.json()
  const headers = { Origin: origin, 'X-CSRF-Token': signed.csrfToken }
  const marker = Date.now().toString(36)
  const created = await page.request.post('/api/works', {
    headers,
    data: { title: '实时书库 ' + marker, studio: '实时会社' },
  })
  expect(created.ok()).toBeTruthy()
  const work = await created.json()
  const draft = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  expect(
    (
      await page.request.post('/api/admin/award-campaigns/' + draft.id + '/transitions', {
        headers,
        data: { phase: 'nomination', version: draft.version },
      })
    ).ok(),
  ).toBeTruthy()
  await page.goto('/awards?campaign=' + draft.id)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '替喜欢的作品，写一封推荐信。', exact: true })
  const source = dialog.getByRole('combobox', { name: '作品来源', exact: true })
  const choose = dialog.getByRole('combobox', { name: '书库作品', exact: true })
  await choose.click()
  const picker = page.getByRole('dialog', { name: '书库作品', exact: true })
  await picker.getByLabel('搜索选项').fill(work.title)
  await picker.getByRole('option', { name: work.title + ' · 实时会社', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByPlaceholder('例如：Key、TYPE-MOON')).toHaveValue('实时会社')
  await dialog.screenshot({ path: test.info().outputPath('nomination-mobile.png') })
  const form = dialog.locator('.award-form')
  for (const control of await form.locator('input, textarea').all()) {
    expect(await control.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(
      16,
    )
    expect(
      await control.evaluate((el) => parseFloat(getComputedStyle(el).borderRadius)),
    ).toBeGreaterThanOrEqual(16)
  }
  await source.selectOption('bangumi')
  const subject = {
    id: 991001,
    title: work.title,
    originalTitle: 'Live catalog ' + marker,
    studio: '来自 Bangumi 的会社',
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
  await dialog.getByLabel('Bangumi 作品名称', { exact: true }).fill(work.title)
  await dialog.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
  await dialog.getByRole('button', { name: '选择此作品提名', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('已在书库')
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/nominations'),
  )
  await form.getByRole('button', { name: '提交提名', exact: true }).click()
  const result = await response
  expect(result.ok(), await result.text()).toBeTruthy()
  expect(result.request().postDataJSON().workId).toBe(work.rank)
  expect(result.request().postDataJSON().subjectId).toBeUndefined()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
  await source.selectOption('manual')
  const title = '手动提名收录 ' + marker
  await dialog.getByPlaceholder('输入作品名称，也可以提名书架之外的作品').fill(title)
  await form.getByRole('button', { name: '提交提名', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const works = await (await page.request.get('/api/works')).json()
  const collected = works.filter((w: { title: string }) => w.title === title)
  expect(collected).toHaveLength(1)
  expect(collected[0].addedBy.id).toBe(work.addedBy.id)
  const state = await (await page.request.get('/api/award-campaigns/' + draft.id)).json()
  expect(state.nominations.find((n: { title: string }) => n.title === title).coverRank).toBe(
    collected[0].rank,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
