import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

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
  let draft = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  const now = Date.now()
  expect(
    (
      await page.request.patch('/api/admin/award-campaigns/' + draft.id, {
        headers,
        data: {
          ...draft,
          nominationStart: new Date(now - 86400000).toISOString(),
          nominationEnd: new Date(now + 86400000).toISOString(),
          votingStart: new Date(now + 86400000).toISOString(),
          votingEnd: new Date(now + 2 * 86400000).toISOString(),
        },
      })
    ).ok(),
  ).toBeTruthy()
  draft = (await (await page.request.get('/api/award-campaigns/' + draft.id)).json()).campaign
  expect(
    (
      await page.request.post('/api/admin/award-campaigns/' + draft.id + '/transitions', {
        headers,
        data: { phase: 'nomination', version: draft.version },
      })
    ).ok(),
  ).toBeTruthy()
  await page.goto('/awards?campaign=' + draft.id)
  await expect(page.locator('.award-stepper')).toBeVisible()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const label of await page.locator('.award-stepper li > div > span, .award-rule-card li p').all())
      expect(await label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(
        14,
      )
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.award-stepper').screenshot({ path: test.info().outputPath('award-times-mobile.png') })
  await page
    .locator('.award-rule-card')
    .screenshot({ path: test.info().outputPath('award-rules-mobile.png') })
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
  await page
    .locator('.award-my-nominations')
    .screenshot({ path: test.info().outputPath('nomination-withdraw-mobile.png') })
  await page.getByRole('button', { name: '撤回提名', exact: true }).click()
  await expect(page.locator('.award-my-nominations')).toHaveCount(0)
  await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
  await source.selectOption('manual')
  const title = '手动提名收录 ' + marker
  await dialog.getByPlaceholder('输入作品名称，也可以提名书架之外的作品').fill(title)
  const upload = dialog.getByLabel('上传提名作品封面', { exact: true })
  await expect(upload).not.toBeVisible()
  await upload.setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid image'),
  })
  await expect(dialog.getByRole('alert')).toContainText('封面请选择')
  const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
  const image = await sharp({ create: { width: 100, height: 150, channels: 3, background: '#dc9d76' } })
    .png()
    .toBuffer()
  const imageFile = { name: 'nomination-cover.png', mimeType: 'image/png', buffer: image }
  await upload.setInputFiles(imageFile)
  const preview = dialog.getByRole('img', { name: '提名作品封面预览', exact: true })
  await expect(preview).toHaveAttribute('src', /^\/api\/assets\//)
  await dialog.getByRole('button', { name: '移除封面', exact: true }).click()
  await expect(preview).toHaveCount(0)
  await upload.setInputFiles(imageFile)
  await expect(preview).toBeVisible()
  await expect(dialog.locator('.nomination-cover-filename')).toContainText('nomination-cover.png')
  const coverUrl = await preview.getAttribute('src')
  await dialog
    .locator('.nomination-cover-field')
    .screenshot({ path: test.info().outputPath('nomination-cover-mobile.png') })
  const invalid = await page.request.post('/api/award-campaigns/' + draft.id + '/nominations', {
    headers,
    data: { title, studio: '', reason: '', coverAssetId: 'invalid-id' },
  })
  expect(invalid.status()).toBe(422)
  await form.getByRole('button', { name: '提交提名', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  const works = await (await page.request.get('/api/works')).json()
  const collected = works.filter((w: { title: string }) => w.title === title)
  expect(collected).toHaveLength(1)
  expect(collected[0].coverUrl).toBe(coverUrl)
  expect((await page.request.get(coverUrl!)).ok()).toBeTruthy()
  expect(collected[0].addedBy.id).toBe(work.addedBy.id)
  const state = await (await page.request.get('/api/award-campaigns/' + draft.id)).json()
  expect(state.nominations.find((n: { title: string }) => n.title === title).coverRank).toBe(
    collected[0].rank,
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: '候选作品', exact: true }).click()
  const card = page.locator('.award-candidate-card').filter({ hasText: title })
  await expect(card).toBeVisible()
  await expect(card.locator('.award-candidate-cover img')).toHaveAttribute('src', coverUrl!)
  await page.locator('.award-tabs').screenshot({ path: test.info().outputPath('nomination-tabs-mobile.png') })
  await card.screenshot({ path: test.info().outputPath('nominate-action-mobile.png') })
  await card.getByRole('button', { name: '我也想提名', exact: true }).click()
  await expect(dialog.getByPlaceholder('输入作品名称，也可以提名书架之外的作品')).toHaveValue(title)
  await expect(dialog.locator('.nomination-cover-field')).toContainText('将使用现有封面')
  await expect(upload).toHaveCount(0)
  await dialog.getByRole('button', { name: '关闭提名窗口', exact: true }).click()
})
