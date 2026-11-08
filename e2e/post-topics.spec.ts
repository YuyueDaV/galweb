import { test, expect } from '@playwright/test'

test('话题选择和草稿恢复、精确筛选、隐藏删除联动及管理员删帖确认与失败提示', async ({
  page,
  browser,
  playwright,
}) => {
  const origin = 'http://127.0.0.1:3117'
  const marker = Date.now().toString(36),
    common = '共同话题' + marker,
    unique = '新话题' + marker
  const staff = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } })
  const adminContext = await browser.newContext({ baseURL: origin })
  try {
    const login = await staff.post('/api/auth/login', {
      data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
    })
    const headers = { 'X-CSRF-Token': (await login.json()).csrfToken }
    const seed = await staff.post('/api/posts', {
      headers,
      data: {
        title: '已有话题的测试帖子 ' + marker,
        content: '管理员创建一篇已有话题的帖子，供选取和联动测试。',
        category: '作品讨论',
        tags: [common],
      },
    })
    expect(seed.ok()).toBeTruthy()
    const seedId = (await seed.json()).id
    await page.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
    })
    await page.goto('/')
    await page.getByRole('button', { name: '写点什么', exact: true }).click()
    const composer = page.getByRole('dialog', { name: '把你的故事，留在这里。' })
    await composer.getByRole('button', { name: '选择话题 ' + common, exact: true }).click()
    await composer.getByLabel('# 话题', { exact: false }).fill('#' + unique)
    await composer.getByRole('button', { name: '添加话题', exact: true }).click()
    await composer.getByLabel('帖子标题', { exact: true }).fill('带话题的阅读手记 ' + marker)
    await composer
      .getByLabel('帖子正文', { exact: true })
      .fill('这是一篇带有选定话题与自定义话题的阅读手记。')
    await composer.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(composer.getByRole('status')).toContainText('草稿已保存')
    await composer.getByRole('button', { name: '关闭发帖窗口', exact: true }).click()
    await page.getByRole('button', { name: '写点什么', exact: true }).click()
    await expect(composer.getByRole('button', { name: '移除话题 ' + unique, exact: true })).toBeVisible()
    await expect(composer.getByRole('button', { name: '移除话题 ' + common, exact: true })).toBeVisible()
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await composer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy()
    }
    await page.screenshot({ path: '.data/topics-composer-mobile.png' })
    await page.setViewportSize({ width: 1440, height: 1000 })
    const published = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/posts',
    )
    await composer.getByRole('button', { name: '发布帖子', exact: true }).click()
    const postId = (await (await published).json()).id
    await expect(page.getByRole('heading', { name: '带话题的阅读手记 ' + marker, exact: true })).toBeVisible()
    await expect(page.locator('.detail-post-tags')).toContainText(unique)
    const csrf = await (
      await page.request.post('/api/auth/csrf', { headers: { Origin: origin }, data: {} })
    ).json()
    expect(
      (
        await page.request.delete('/api/posts/' + seedId, {
          headers: { Origin: origin, 'X-CSRF-Token': csrf.csrfToken },
          data: {},
        })
      ).status(),
    ).toBe(403)
    await page.goto('/')
    const rail = page.locator('.topics-card')
    await expect(rail.getByRole('link').filter({ hasText: common })).toContainText('2 篇')
    await rail.getByRole('link').filter({ hasText: unique }).click()
    await expect(page.locator('.active-filters')).toContainText('话题：#' + unique)
    await expect(page.locator('.post-card')).toHaveCount(1)
    await expect(page.locator('.post-card')).toContainText('带话题的阅读手记')
    await page.screenshot({ path: '.data/topics-filter-desktop.png' })

    const admin = await adminContext.newPage()
    await admin.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
    })
    await admin.goto('/admin')
    const seedRow = admin.locator(`[data-post-id="${seedId}"]`)
    await seedRow.getByRole('button', { name: '隐藏', exact: true }).click()
    await expect(seedRow).toContainText('已隐藏')
    await page.reload()
    await expect(rail.getByRole('link').filter({ hasText: common })).toContainText('1 篇')
    const row = admin.locator(`[data-post-id="${postId}"]`)
    await row.getByRole('button', { name: '删除帖子', exact: true }).click()
    await row.getByRole('button', { name: '取消删除帖子', exact: true }).click()
    await expect(row.getByRole('button', { name: '确认删除帖子', exact: true })).toHaveCount(0)
    await row.getByRole('button', { name: '删除帖子', exact: true }).click()
    await admin.route('**/api/posts/' + postId, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: '测试删帖失败，请重试。' }),
          })
        : route.continue(),
    )
    await row.getByRole('button', { name: '确认删除帖子', exact: true }).click()
    await expect(admin.getByRole('alert')).toContainText('测试删帖失败')
    await expect(row).toContainText('已发布')
    await admin.unroute('**/api/posts/' + postId)
    await row.getByRole('button', { name: '确认删除帖子', exact: true }).click()
    await expect(row).toContainText('已删除')
    await expect(row.getByRole('button')).toHaveCount(0)
    await page.reload()
    await expect(rail.getByRole('link').filter({ hasText: unique })).toHaveCount(0)
    await expect(rail.getByRole('link').filter({ hasText: common })).toHaveCount(0)
    expect(
      (await staff.get('/api/posts?tag=' + encodeURIComponent(unique)).then((r) => r.json())).total,
    ).toBe(0)
    // The remaining super administrator can also remove a hidden post.
    const ownerLogin = await staff.post('/api/auth/login', {
      data: { username: 'browser_owner_other', password: 'Isolated moderator password 123!' },
    })
    const ownerHeaders = { 'X-CSRF-Token': (await ownerLogin.json()).csrfToken }
    expect(
      (await staff.delete('/api/posts/' + seedId, { headers: ownerHeaders, data: {} })).ok(),
    ).toBeTruthy()
  } finally {
    await adminContext.close()
    await staff.dispose()
  }
})
