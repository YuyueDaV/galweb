import { test, expect, type Page } from '@playwright/test'
import type { AwardCampaign } from '../packages/domain/award-types'

function activity() {
  const now = Date.now()
  const campaign: AwardCampaign = {
    id: 'loading-test-campaign',
    edition: 2,
    title: '加载测试活动',
    phase: 'nomination',
    nominationLimit: 3,
    voteLimit: 3,
    winnerCount: 12,
    version: 1,
    nominationStart: new Date(now - 86400000).toISOString(),
    nominationEnd: new Date(now + 86400000).toISOString(),
    votingStart: new Date(now + 86400000).toISOString(),
    votingEnd: new Date(now + 172800000).toISOString(),
    createdAt: new Date(now).toISOString(),
  }
  return { campaign, nominations: [], myBallot: null, ballotCount: 0, results: [], audit: [] }
}
function gate() {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}
async function openAwards(page: Page) {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '十二橙器', exact: true })
    .click()
}

test('书架复用 SSR 数据，切换活动与重复打开提名不重下目录', async ({ page }) => {
  await page.clock.install()
  const works = await (await page.request.get('/api/works?view=summary')).json()
  const data = activity(),
    calls = { catalog: 0, list: 0, detail: 0 }
  await page.route('**/api/works?view=summary', (route) => route.fulfill({ json: works }))
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/works') calls.catalog++
  })
  await page.route('**/api/award-campaigns', (route) => {
    calls.list++
    return route.fulfill({ json: [data.campaign] })
  })
  await page.route('**/api/award-campaigns/*', (route) => {
    calls.detail++
    return route.fulfill({ json: data })
  })
  await page.goto('/works')
  await expect(page.locator('.work-card').first()).toBeVisible()
  expect(calls.catalog).toBe(0)
  await openAwards(page)
  await expect(page.locator('.award-stepper')).toBeVisible()
  const dialog = page.getByRole('dialog', { name: '替喜欢的作品，写一封推荐信。', exact: true })
  for (let index = 0; index < 2; index++) {
    await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
  expect(calls).toEqual({ catalog: 0, list: 1, detail: 1 })
  // Move the cache clock without advancing request timeout or polling timers.
  await page.clock.setSystemTime(new Date(Date.now() + 61_000))
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '作品书架', exact: true })
    .click()
  await expect(page.locator('.work-card').first()).toBeVisible()
  expect(calls.catalog).toBe(1)
})

test('目录失败可手动重试，恢复后继续复用共享缓存', async ({ page }) => {
  const works = await (await page.request.get('/api/works?view=summary')).json(),
    data = activity()
  let catalogs = 0
  let available = false
  await page.route('**/api/works?view=summary', (route) => {
    catalogs++
    return !available
      ? route.fulfill({ status: 503, json: { message: '书库暂不可用' } })
      : route.fulfill({ json: works })
  })
  await page.route('**/api/award-campaigns', (route) => route.fulfill({ json: [data.campaign] }))
  await page.route('**/api/award-campaigns/*', (route) => route.fulfill({ json: data }))
  await page.goto('/ranking')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '作品书架', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('书库暂时未能加载')
  available = true
  await page.getByRole('button', { name: '重试加载', exact: true }).click()
  await expect(page.locator('.work-card').first()).toBeVisible()
  const recoveredCalls = catalogs
  await openAwards(page)
  await expect(page.locator('.award-stepper')).toBeVisible()
  expect(catalogs).toBe(recoveredCalls)
})

test('慢书库不阻塞活动展示，轮询只拉详情且归档后停止', async ({ page }) => {
  await page.clock.install()
  const data = activity(),
    catalogGate = gate(),
    detailGate = gate()
  let lists = 0,
    details = 0,
    holdDetail = false
  let catalogs = 0
  await page.route('**/api/works?view=summary', async (route) => {
    catalogs++
    await catalogGate.promise
    await route.fulfill({ json: [] })
  })
  await page.route('**/api/award-campaigns', (route) => {
    lists++
    return route.fulfill({ json: [data.campaign] })
  })
  await page.route('**/api/award-campaigns/*', async (route) => {
    details++
    if (holdDetail) await detailGate.promise
    await route.fulfill({ json: data })
  })
  try {
    await page.goto('/awards')
    await expect(page.locator('.award-stepper')).toBeVisible()
    expect(lists).toBe(1)
    expect(details).toBe(1)
    holdDetail = true
    await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '正在加载书库' })).toBeVisible()
    await page.keyboard.press('Escape')
    expect(catalogs).toBe(1)
    await page.clock.runFor(16000)
    await expect.poll(() => details).toBe(2)
    // Stay inside the API client's 15-second timeout while the response is held.
    await page.clock.runFor(5000)
    expect(details).toBe(2)
    expect(lists).toBe(1)
    data.campaign.phase = 'archived'
    detailGate.release()
    await expect(page.locator('.award-archive-strip')).toBeVisible()
    await page.clock.runFor(30000)
    expect(details).toBe(2)
    expect(lists).toBe(1)
  } finally {
    catalogGate.release()
    detailGate.release()
  }
})

test('初始化请求未完成就离开活动页，不会在离开后创建轮询', async ({ page }) => {
  await page.clock.install()
  const data = activity(),
    pending = gate(),
    seen = gate()
  let lists = 0,
    details = 0
  await page.route('**/api/award-campaigns', async (route) => {
    lists++
    seen.release()
    await pending.promise
    await route.fulfill({ json: [data.campaign] })
  })
  await page.route('**/api/award-campaigns/*', (route) => {
    details++
    return route.fulfill({ json: data })
  })
  await page.goto('/works')
  await expect(page.locator('.work-card').first()).toBeVisible()
  try {
    await openAwards(page)
    await seen.promise
    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: '作品书架', exact: true })
      .click()
    await expect(page.locator('.work-card').first()).toBeVisible()
    pending.release()
    await expect.poll(() => details).toBe(1)
    await page.clock.runFor(31000)
    expect(lists).toBe(1)
    expect(details).toBe(1)
  } finally {
    pending.release()
  }
})

test('第一届静态归档不等待届次接口，封面选择响应式资源', async ({ page }) => {
  const pending = gate()
  await page.route('**/api/award-campaigns', async (route) => {
    await pending.promise
    await route.fulfill({ json: [] })
  })
  try {
    const response = await page.goto('/ranking')
    expect(await response!.text()).toContain('因为有人喜欢，所以值得被看见。')
    const covers = page.locator('.rank-feature-cover img')
    await expect(covers).toHaveCount(3)
    await expect
      .poll(() =>
        covers.evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
      )
      .toBe(true)
    for (const cover of await covers.all()) {
      expect(await cover.evaluate((image) => (image as HTMLImageElement).currentSrc)).toContain(
        '/images/works/responsive/',
      )
    }
    await expect(page.locator('.rank-row-cover img').first()).toHaveAttribute('loading', 'lazy')
  } finally {
    pending.release()
  }
})
