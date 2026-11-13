import { test, expect } from '@playwright/test'

test('超管编辑已提名作品与后台提名人增删：失败保留、撤销删除和保存生效', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_owner_other', password: 'Isolated moderator password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrfToken }
  const campaign = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  expect(
    (
      await page.request.post('/api/admin/award-campaigns/' + campaign.id + '/transitions', {
        headers,
        data: { phase: 'nomination', version: campaign.version },
      })
    ).ok(),
  ).toBeTruthy()
  const title = '管理入口 ' + Date.now()
  const submitted = await (
    await page.request.post('/api/award-campaigns/' + campaign.id + '/nominations', {
      headers,
      data: { title, studio: '旧会社', reason: '已提交说明' },
    })
  ).json()
  const state = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
  const original = state.nominations.find((n: { id: string }) => n.id === submitted.id)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/awards?campaign=' + campaign.id)
  const card = page.locator('.award-candidate-card').filter({ hasText: title })
  await card.getByRole('button', { name: '编辑作品', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑作品资料', exact: true })
  await expect(editor.getByLabel('作品名称', { exact: true })).toHaveValue(title)
  const newTitle = title + ' · 修订'
  await editor.getByLabel('作品名称', { exact: true }).fill(newTitle)
  await editor.getByLabel('制作组／会社', { exact: true }).fill('新会社')
  await editor.getByLabel('作品简介', { exact: true }).fill('超管补充的作品简介')
  const candidateEndpoint =
    '/api/admin/award-campaigns/' + campaign.id + '/candidates/' + original.candidateId
  await page.route('**' + candidateEndpoint, (route) =>
    route.fulfill({ status: 503, json: { message: '作品保存失败，请重试。' } }),
  )
  await editor.getByRole('button', { name: '保存作品资料', exact: true }).click()
  await expect(editor.getByRole('alert')).toContainText('作品保存失败')
  await expect(editor.getByLabel('作品名称', { exact: true })).toHaveValue(newTitle)
  await editor.evaluate((el) => {
    el.scrollTop = 0
  })
  await editor.screenshot({ path: test.info().outputPath('candidate-edit-mobile.png') })
  expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy()
  await page.unroute('**' + candidateEndpoint)
  await editor.getByRole('button', { name: '保存作品资料', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(card.getByRole('heading', { name: newTitle, exact: true })).toBeVisible()
  const work = await (await page.request.get('/api/works/' + original.coverRank)).json()
  expect(work.studio).toBe('新会社')
  expect(work.description).toBe('超管补充的作品简介')
  expect(
    (
      await page.request.patch(candidateEndpoint, { headers: { Origin: origin }, data: { title: newTitle } })
    ).status(),
  ).toBe(403)
  await card.getByRole('button', { name: '编辑作品', exact: true }).click()
  await editor.getByRole('link', { name: '管理本作提名人和提名词' }).click()
  const details = page.getByRole('dialog', { name: '编辑提名人和提名词', exact: true })
  await expect(details).toBeVisible()
  await expect(details.locator('fieldset')).toHaveCount(1)
  await details.getByRole('button', { name: '增加提名人', exact: true }).click()
  const added = details.locator('fieldset').last()
  await added.getByLabel('提名人', { exact: true }).fill('新补录群友')
  await added.getByLabel('提名来源', { exact: true }).fill('QQ群 · 测试群')
  await added.getByLabel('提名词', { exact: true }).fill('新增提名词')
  await details.locator('fieldset').first().getByRole('button', { name: '删除提名人', exact: true }).click()
  await expect(details).toContainText('待删除')
  await details.getByRole('button', { name: '撤销删除', exact: true }).click()
  await expect(details.locator('fieldset').first().getByLabel('提名人', { exact: true })).toBeEditable()
  await details.locator('fieldset').first().getByRole('button', { name: '删除提名人', exact: true }).click()
  await expect(details.locator('.nomination-change-summary')).toContainText('新增 1 位、删除 1 位')
  const detailsEndpoint = '/api/admin/award-campaigns/' + campaign.id + '/nomination-details'
  await page.route('**' + detailsEndpoint, (route) =>
    route.fulfill({ status: 409, json: { message: '测试并发冲突，本次未保存。' } }),
  )
  await details.getByRole('button', { name: '保存全部修改', exact: true }).click()
  await expect(details.getByRole('alert')).toContainText('测试并发冲突')
  await expect(added.getByLabel('提名人', { exact: true })).toHaveValue('新补录群友')
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await details.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  }
  await details.evaluate((el) => {
    el.scrollTop = 0
  })
  await details.screenshot({ path: test.info().outputPath('nomination-add-remove-desktop.png') })
  await page.unroute('**' + detailsEndpoint)
  await details.getByRole('button', { name: '保存全部修改', exact: true }).click()
  await expect(details).not.toBeVisible()
  const updated = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
  expect(updated.nominations).toHaveLength(1)
  expect(updated.nominations[0].displayOverride.nominatorName).toBe('新补录群友')
  expect(updated.nominations[0].displayOverride.source).toBe('QQ群 · 测试群')
  expect(updated.nominations[0].status).toBe('pending')
  expect(updated.nominations[0].candidateId).toBe(original.candidateId)
  const member = await browser.newContext({ baseURL: origin })
  try {
    const signed = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_auth', password: 'Isolated moderator password 123!' },
    })
    const memberHeaders = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
    const input = {
      title: newTitle,
      subtitle: '',
      studio: '越权会社',
      description: '',
      version: work.version,
    }
    expect(
      (await member.request.patch(candidateEndpoint, { headers: memberHeaders, data: input })).status(),
    ).toBe(403)
    const reader = await member.newPage()
    await reader.goto('/awards?campaign=' + campaign.id)
    await expect(reader.getByRole('button', { name: '编辑作品', exact: true })).toHaveCount(0)
    const publicCard = reader.locator('.award-candidate-card').filter({ hasText: newTitle })
    await expect(publicCard).toContainText('新补录群友')
    await publicCard.locator('.award-public-details summary').first().click()
    await expect(publicCard).toContainText('新增提名词')
    await expect(publicCard).toContainText('来源：QQ群 · 测试群')
  } finally {
    await member.close()
  }
})
