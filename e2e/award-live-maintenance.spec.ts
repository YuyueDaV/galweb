import { test, expect, type Page } from './fixtures'

test('实时排名每五秒更新、同分并列、失败保留数据，手机可读', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:3117' },
    data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
  })
  expect(login.ok()).toBeTruthy()
  let ballotWrites = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname.endsWith('/ballot')) ballotWrites++
  })
  await page.clock.install()
  const campaign = {
    id: 'live-ranking-fixture',
    edition: 88,
    title: '实时排名测试',
    phase: 'voting',
    nominationLimit: 3,
    voteLimit: 3,
    winnerCount: 12,
    votingRule: 'legacy',
    version: 1,
    nominationStart: null,
    nominationEnd: null,
    votingStart: null,
    votingEnd: null,
    createdAt: new Date().toISOString(),
  }
  const nominations = ['A', 'B', 'C'].map((title, index) => ({
    id: 'n' + index,
    candidateId: 'c' + index,
    campaignId: campaign.id,
    title: '实时作品' + title,
    studio: '会社',
    reason: '提名说明',
    status: 'approved',
    accountId: 'fixture',
    accountName: '提名人' + title,
    createdAt: new Date().toISOString(),
  }))
  const scores = [3, 1, 0]
  let failed = false,
    details = 0
  await page.route('**/api/award-campaigns', (route) => route.fulfill({ json: [campaign] }))
  await page.route('**/api/award-campaigns/*', (route) => {
    details++
    if (failed) return route.fulfill({ status: 503, json: { message: '排名服务暂不可用' } })
    const ordered = nominations
      .map((n, index) => ({
        id: n.candidateId,
        title: n.title,
        studio: n.studio,
        nominations: [n],
        votes: scores[index],
      }))
      .sort((a, b) => b.votes! - a.votes!)
    const results = ordered.map((result, index) => ({
      ...result,
      rank: ordered.findIndex((other) => other.votes === result.votes) + 1,
    }))
    return route.fulfill({
      json: { campaign, nominations, results, myBallot: null, ballotCount: 2, audit: [] },
    })
  })
  await page.goto('/awards')
  await page.getByRole('checkbox', { name: '投票给实时作品A', exact: true }).check()
  await page.getByRole('button', { name: '实时排名', exact: true }).click()
  const panel = page.getByRole('region', { name: '实时分数排名', exact: true })
  await expect(panel.locator('.ranking-list li').first()).toContainText('实时作品A')
  scores[1] = 5
  await page.clock.runFor(5100)
  await expect(panel.locator('.ranking-list li').first()).toContainText('实时作品B')
  await expect(panel.locator('[data-candidate-id="c1"] .ranking-points')).toContainText('5')
  scores[0] = 5
  await page.clock.runFor(5100)
  await expect(panel.locator('[data-candidate-id="c0"] .ranking-place')).toHaveText('01')
  await expect(panel.locator('[data-candidate-id="c1"] .ranking-place')).toHaveText('01')
  failed = true
  await page.clock.runFor(6500)
  await expect(panel.getByRole('alert')).toContainText('保留上次成功更新的数据')
  await expect(panel.locator('[data-candidate-id="c1"] .ranking-points')).toContainText('5')
  failed = false
  await panel.getByRole('button', { name: '刷新排名', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveCount(0)
  expect(details).toBeGreaterThanOrEqual(5)
  await page.getByRole('button', { name: '候选作品', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: '投票给实时作品A', exact: true })).toBeChecked()
  campaign.votingRule = 'weighted-v1'
  await page.clock.runFor(5100)
  await page.getByRole('button', { name: '我的选票', exact: true }).click()
  const ballot = page.getByRole('region', { name: '真爱与喜爱选票', exact: true })
  await ballot.locator('select').first().selectOption('c0')
  await ballot.locator('textarea').first().fill('自动刷新时保留的推荐词。')
  await page.clock.runFor(10500)
  await expect(ballot.locator('select').first()).toHaveValue('c0')
  await expect(ballot.locator('textarea').first()).toHaveValue('自动刷新时保留的推荐词。')
  expect(ballotWrites).toBe(0)
  await page.getByRole('button', { name: '实时排名', exact: true }).click()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy()
  }
  await panel.screenshot({ path: test.info().outputPath('live-ranking-mobile.png') })
})

async function choose(page: Page, label: string, name: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page
    .getByRole('dialog', { name: label, exact: true })
    .getByRole('option', { name, exact: true })
    .click()
}

test('超管投票期间补录作品、改资料来源与提名人、移除恢复及历史分数保护', async ({ page }) => {
  const origin = 'http://127.0.0.1:3117',
    marker = Date.now().toString(36)
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_owner_other', password: 'Isolated moderator password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
  const campaign = await (await page.request.post('/api/admin/award-campaigns', { headers, data: {} })).json()
  let current = campaign
  const refresh = async () => {
    current = (await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()).campaign
    return current
  }
  const phase = async (value: string) => {
    await refresh()
    const response = await page.request.post('/api/admin/award-campaigns/' + campaign.id + '/transitions', {
      headers,
      data: { phase: value, version: current.version },
    })
    expect(response.ok()).toBeTruthy()
    await refresh()
  }
  expect(
    (
      await page.request.patch('/api/admin/award-campaigns/' + campaign.id, {
        headers,
        data: { ...campaign, winnerCount: 1 },
      })
    ).ok(),
  ).toBeTruthy()
  await phase('nomination')
  const title = '初始候选' + marker
  expect(
    (
      await page.request.post('/api/admin/award-campaigns/' + campaign.id + '/candidates', {
        headers,
        data: {
          title,
          studio: '会社',
          reason: '初始候选',
          nominatorName: '初始提名人',
          nominatedAt: new Date(Date.now() - 1000).toISOString(),
        },
      })
    ).ok(),
  ).toBeTruthy()
  const initial = (await (await page.request.get('/api/award-campaigns/' + campaign.id)).json())
    .nominations[0]
  const excludedTitle = '未通过候选' + marker
  const excludedResponse = await page.request.post('/api/award-campaigns/' + campaign.id + '/nominations', {
    headers,
    data: { title: excludedTitle, studio: '会社', reason: '留存的提名记录' },
  })
  expect(excludedResponse.ok()).toBeTruthy()
  const excluded = await excludedResponse.json()
  expect(
    (
      await page.request.patch('/api/award-campaigns/' + campaign.id + '/nominations/' + excluded.id, {
        headers,
        data: { status: 'withdrawn', note: '' },
      })
    ).ok(),
  ).toBeTruthy()
  await phase('voting')
  expect(
    (
      await page.request.put('/api/award-campaigns/' + campaign.id + '/ballot', {
        headers,
        data: {
          candidateIds: [initial.candidateId],
          version: 0,
          round: 1,
          weighted: { loveId: initial.candidateId, likeIds: [], recommendations: [] },
        },
      })
    ).ok(),
  ).toBeTruthy()
  await page.goto('/admin/awards?campaign=' + campaign.id)
  await page.getByRole('button', { name: '提名审核', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '审核记录筛选', exact: true })).toHaveValue('all')
  const votingRecord = page.locator('.award-review-list article').filter({
    has: page.getByRole('heading', { name: title, exact: true }),
  })
  await expect(votingRecord.getByRole('button', { name: '编辑作品', exact: true })).toBeVisible()
  await votingRecord.getByRole('button', { name: '编辑作品', exact: true }).click()
  const votingEditor = page.getByRole('dialog', { name: '编辑作品资料', exact: true })
  await expect(votingEditor.getByRole('combobox', { name: '关联已有书库作品', exact: true })).toBeEnabled()
  await votingEditor.getByLabel('作品资料来源', { exact: true }).fill('投票期审核页更正来源')
  await votingEditor.getByRole('button', { name: '保存作品资料', exact: true }).click()
  await expect(votingEditor).not.toBeVisible()
  await votingRecord.getByRole('button', { name: /编辑本作提名/ }).click()
  const votingNominators = page.getByRole('dialog', { name: '编辑提名人和提名词', exact: true })
  await expect(votingNominators.getByLabel('提名人', { exact: true })).toBeEditable()
  await votingNominators.getByRole('button', { name: '取消', exact: true }).click()
  const excludedRecord = page.locator('.award-review-list article').filter({
    has: page.getByRole('heading', { name: excludedTitle, exact: true }),
  })
  await page.getByRole('button', { name: '作品维护', exact: true }).click()
  const excludedMaintenance = page
    .locator('.maintenance-record')
    .filter({ has: page.getByRole('heading', { name: new RegExp(excludedTitle) }) })
  await expect(excludedMaintenance).toContainText('未入候选')
  await page.getByRole('button', { name: '提名审核', exact: true }).click()
  await excludedRecord.getByRole('button', { name: /编辑本作提名/ }).click()
  await votingNominators.getByRole('button', { name: '增加提名人', exact: true }).click()
  const addedNominator = votingNominators.locator('fieldset').last()
  await addedNominator.getByLabel('提名人', { exact: true }).fill('投票期补录群友')
  await addedNominator.getByLabel('提名来源', { exact: true }).fill('QQ群')
  await addedNominator.getByLabel('提名词', { exact: true }).fill('补录说明')
  await votingNominators.getByRole('button', { name: '保存全部修改', exact: true }).click()
  await expect(votingNominators).not.toBeVisible()
  await expect(excludedRecord).toHaveCount(2)
  const afterBackfill = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
  const backfilled = afterBackfill.nominations.find(
    (n: { displayOverride?: { nominatorName: string } }) =>
      n.displayOverride?.nominatorName === '投票期补录群友',
  )
  expect(backfilled.status).toBe('approved')
  expect(
    afterBackfill.results.map((n: { id: string; votes: number }) => ({ id: n.id, votes: n.votes })),
  ).toEqual([
    { id: initial.candidateId, votes: 2 },
    { id: backfilled.candidateId, votes: 0 },
  ])
  // An earlier mistaken withdrawal can be corrected without adding duplicate people.
  await excludedRecord
    .first()
    .getByRole('button', { name: /编辑本作提名/ })
    .click()
  await votingNominators.getByRole('checkbox', { name: '设为有效提名（已通过）', exact: true }).check()
  await votingNominators.getByRole('button', { name: '保存全部修改', exact: true }).click()
  await expect(votingNominators).not.toBeVisible()
  const repairedState = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
  expect(repairedState.nominations.find((n: { id: string }) => n.id === excluded.id).status).toBe('approved')
  expect(
    repairedState.nominations.filter(
      (n: { candidateId: string }) => n.candidateId === backfilled.candidateId,
    ),
  ).toHaveLength(2)
  await page.getByRole('button', { name: '作品维护', exact: true }).click()
  const panel = page.getByRole('region', { name: '提名作品维护', exact: true })
  await expect(excludedMaintenance).toContainText('有效候选')
  await choose(page, '记录状态', '有效候选')
  await expect(excludedMaintenance).toBeVisible()
  await expect(panel).toContainText(title)
  await panel.getByRole('button', { name: '补录候选作品', exact: true }).click()
  await choose(page, '作品来源', '手动填写')
  const addedTitle = '补录候选' + marker
  const form = panel.locator('.maintenance-add')
  await form.getByLabel('作品名称', { exact: true }).fill(addedTitle)
  await form.getByLabel('制作组／会社', { exact: true }).fill('补录会社')
  await form.getByLabel('提名人', { exact: true }).fill('群内提名人')
  await form.getByLabel('作品资料来源', { exact: true }).fill('官方资料核对')
  await form.getByRole('button', { name: '保存候选作品', exact: true }).click()
  const row = panel.locator('.maintenance-record').filter({ hasText: addedTitle })
  await expect(row).toContainText('群内提名人')
  await row.getByRole('button', { name: '编辑作品', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑作品资料', exact: true })
  await editor.getByLabel('作品资料来源', { exact: true }).fill('Bangumi 与官网交叉核对')
  await editor.getByRole('button', { name: '保存作品资料', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(row).toContainText('Bangumi 与官网交叉核对')
  await row.getByRole('button', { name: '编辑提名人和提名渠道', exact: true }).click()
  const nominators = page.getByRole('dialog', { name: '编辑提名人和提名词', exact: true })
  await nominators.getByLabel('提名人', { exact: true }).fill('更正提名人')
  await nominators.getByRole('button', { name: '保存全部修改', exact: true }).click()
  await expect(nominators).not.toBeVisible()
  await page.getByRole('button', { name: '作品维护', exact: true }).click()
  await expect(row).toContainText('更正提名人')
  await row.getByRole('button', { name: '移除候选作品', exact: true }).click()
  const remove = page.getByRole('dialog', { name: '移除候选作品', exact: true })
  await remove.getByLabel('输入完整作品名称确认').fill(addedTitle)
  await remove.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(row).toHaveCount(0)
  await choose(page, '记录状态', '已移除')
  await row.getByRole('button', { name: '恢复候选作品', exact: true }).click()
  const restore = page.getByRole('dialog', { name: '恢复候选作品', exact: true })
  await restore.getByLabel('输入完整作品名称确认').fill(addedTitle)
  await restore.getByRole('button', { name: '确认恢复', exact: true }).click()
  await choose(page, '记录状态', '未移除作品')
  await expect(row).toContainText('更正提名人')
  await phase('results')
  const before = (await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()).results.map(
    (item: { id: string; votes: number; rank: number }) => ({
      id: item.id,
      votes: item.votes,
      rank: item.rank,
    }),
  )
  await phase('archived')
  await page.reload()
  await page.getByRole('button', { name: '作品维护', exact: true }).click()
  await row.getByRole('button', { name: '编辑作品', exact: true }).click()
  await editor.getByLabel('作品资料来源', { exact: true }).fill('归档后校对资料')
  await editor.getByRole('button', { name: '保存作品资料', exact: true }).click()
  await expect(editor).not.toBeVisible()
  const after = (await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()).results.map(
    (item: { id: string; votes: number; rank: number }) => ({
      id: item.id,
      votes: item.votes,
      rank: item.rank,
    }),
  )
  expect(after).toEqual(before)
  await page.setViewportSize({ width: 390, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await panel.screenshot({ path: test.info().outputPath('candidate-maintenance-mobile.png') })
})
