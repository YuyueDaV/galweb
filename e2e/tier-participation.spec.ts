import { test, expect } from '@playwright/test'

test('注册用户参与共同榜并改票撤回；通过 Bangumi 制作个人榜、作者隔离和内容审核', async ({
  page,
  playwright,
}) => {
  const origin = 'http://127.0.0.1:3117'
  const staff = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })
  const anonymous = await playwright.request.newContext({ baseURL: origin })
  try {
    const login = await staff.post('/api/auth/login', {
      data: { username: 'browser_tiers_editor', password: 'Isolated editor password 123!' },
    })
    const staffHeaders = { 'X-CSRF-Token': (await login.json()).csrfToken }
    const created = await staff.post('/api/admin/tier-lists', {
        headers: staffHeaders,
        data: { title: '共同参与测试榜' },
      }),
      board = await created.json()
    const template = {
      title: board.title,
      description: '共同参与与实时人数统计',
      rows: [
        { id: 's', label: 'S', color: '#e8a899', workIds: [3] },
        { id: 'a', label: 'A', color: '#baddaa', workIds: [10] },
      ],
      version: 0,
      action: 'publish',
    }
    expect(
      (await staff.put('/api/admin/tier-lists/' + board.id, { headers: staffHeaders, data: template })).ok(),
    ).toBeTruthy()
    await page.goto('/tiers/' + board.id)
    await page.getByRole('button', { name: '登录后参与分层', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '账号与登录' })
    await dialog.getByLabel('用户名', { exact: true }).fill('browser_member')
    await dialog.getByLabel('密码', { exact: true }).fill('Isolated moderator password 123!')
    await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('button', { name: '将魔法使之夜分到S', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '将魔法使之夜分到S', exact: true }).click()
    await page.getByRole('button', { name: '将CLANNAD分到A', exact: true }).click()
    await page.getByRole('button', { name: '提交我的选择', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '你的分层选择已提交' })).toBeVisible()
    await expect(page.getByTestId('tier-participants')).toHaveText('1')
    const otherBallot = await (await staff.get('/api/tier-lists/' + board.id + '/ballot')).json()
    expect(
      (
        await staff.put('/api/tier-lists/' + board.id + '/ballot', {
          headers: staffHeaders,
          data: { ...otherBallot, choices: [{ workId: 3, rowId: 's' }] },
        })
      ).ok(),
    ).toBeTruthy()
    await page.reload()
    const work = page.locator('[data-tier-work="3"]')
    await expect(work.locator('[data-tier-count="s"]')).toHaveText('2 人')
    await page.getByRole('button', { name: '将魔法使之夜分到A', exact: true }).click()
    await page.getByRole('button', { name: '提交我的选择', exact: true }).click()
    await expect(work.locator('[data-tier-count="s"]')).toHaveText('1 人')
    await expect(work.locator('[data-tier-count="a"]')).toHaveText('1 人')
    await expect(page.getByTestId('tier-participants')).toHaveText('2')
    await page.getByRole('button', { name: '撤回我的选择', exact: true }).click()
    await expect(page.getByTestId('tier-participants')).toHaveText('1')
    await expect(work.locator('[data-tier-count="a"]')).toHaveText('0 人')
    await page.screenshot({ path: test.info().outputPath('community-tier-counts.png'), fullPage: true })
    await page.goto('/tiers/mine')
    const personalCreated = page.waitForResponse(
      (response) => response.url().endsWith('/api/my/tier-lists') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '新建个人 Tier 榜', exact: true }).click()
    const personal = await (await personalCreated).json(),
      title = '我的 Bangumi 个人榜 ' + Date.now()
    await page.getByLabel('榜单标题', { exact: true }).fill(title)
    const subject = {
      id: 13,
      title: 'CLANNAD',
      originalTitle: 'CLANNAD',
      summary: '测试作品',
      studio: 'Key',
      date: '2004-04-28',
      coverUrl: '',
      score: 8.9,
      ratingCount: 10,
      tags: [],
      syncedAt: Date.now(),
    }
    await page.route('**/api/bangumi/search?*', (route) =>
      route.fulfill({ json: { items: [subject], total: 1, page: 1 } }),
    )
    const works = await (await staff.get('/api/works')).json()
    await page.route('**/api/my/tier-works/import', (route) => {
      expect(route.request().postDataJSON()).toEqual({ subjectId: 13 })
      return route.fulfill({
        json: { work: works.find((item: { rank: number }) => item.rank === 10), reused: true },
      })
    })
    await page.getByLabel('Bangumi 作品名称', { exact: true }).fill('CLANNAD')
    await page.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
    await page.getByRole('button', { name: '加入榜单作品池', exact: true }).click()
    await expect(page.getByLabel('移动CLANNAD到分层', { exact: true })).toBeVisible()
    await page.getByLabel('移动CLANNAD到分层', { exact: true }).selectOption('a')
    await page.getByRole('button', { name: '发布当前版本', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '榜单已发布' })).toBeVisible()
    const published = await (await anonymous.get('/api/tier-lists/' + personal.id)).json()
    expect(published.mode).toBe('personal')
    expect(published.author.name).toBe('browser_member')
    const owner = await (await page.request.get('/api/auth/me')).json()
    expect(published.author.id).toBe(owner.user.id)
    expect(
      (
        await staff.put('/api/my/tier-lists/' + personal.id, {
          headers: staffHeaders,
          data: { ...template, title: '越权编辑', version: 1 },
        })
      ).status(),
    ).toBe(403)
    expect((await anonymous.get('/api/tier-lists/' + personal.id + '/ballot')).status()).toBe(401)
    await page.goto('/tiers/' + personal.id)
    await expect(page.locator('.tier-author')).toContainText('browser_member')
    await expect(page.getByRole('region', { name: 'A层', exact: true })).toContainText('CLANNAD')
    await expect(page.getByRole('heading', { name: '同好们的分层选择', exact: true })).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath('personal-tier-author.png'), fullPage: true })
    const review = await (await staff.get('/api/admin/tier-moderation')).json(),
      target = review.find((item: { id: string }) => item.id === personal.id)
    expect(
      (
        await staff.patch('/api/admin/tier-lists/' + personal.id + '/moderation', {
          headers: staffHeaders,
          data: { version: target.version, blocked: true },
        })
      ).ok(),
    ).toBeTruthy()
    expect((await anonymous.get('/api/tier-lists/' + personal.id)).status()).toBe(404)
    await page.goto('/tiers/mine')
    await page.getByRole('button', { name: title + ' · 草稿', exact: true }).click()
    await page.getByRole('button', { name: '发布当前版本', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: '已被管理员下架' }).first()).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
  } finally {
    await staff.dispose()
    await anonymous.dispose()
  }
})
