import { test, expect } from '@playwright/test'

test('访客开放 Bangumi 搜索；管理员编辑 Tier、草稿发布隔离和下架', async ({ page, playwright }) => {
  const origin = 'http://127.0.0.1:3117'
  const anonymous = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  })
  const subject = {
    id: 13,
    title: 'CLANNAD',
    originalTitle: 'CLANNAD',
    summary: '书架搜索测试',
    studio: 'Key',
    date: '2004-04-28',
    coverUrl: '',
    score: 8.9,
    ratingCount: 100,
    tags: ['视觉小说'],
    syncedAt: Date.now(),
  }
  try {
    await page.route('**/api/bangumi/search?*', (route) =>
      route.fulfill({ json: { items: [subject], total: 1, page: 1 } }),
    )
    await page.goto('/works')
    await page.getByLabel('Bangumi 作品名称', { exact: true }).fill('CLANNAD')
    await page.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
    await expect(page.locator('.bangumi-result')).toContainText('Bangumi 8.9')
    await expect(
      page.locator('.bangumi-result').getByRole('link', { name: '查看 Bangumi ↗' }),
    ).toHaveAttribute('href', 'https://bgm.tv/subject/13')
    await expect(page.getByRole('button', { name: '收录到书库', exact: true })).toHaveCount(0)
    await page.locator('.bangumi-panel').scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath('public-bangumi-search.png') })
    await page.unroute('**/api/bangumi/search?*')
    await page.route('**/api/bangumi/search?*', (route) =>
      route.fulfill({ status: 502, json: { message: 'Bangumi 测试服务暂不可用。' } }),
    )
    await page.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Bangumi 测试服务暂不可用' })).toBeVisible()
    expect((await anonymous.post('/api/admin/works/import', { data: { subjectId: 13 } })).status()).toBe(401)
    await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '账号与登录' })
    await dialog.getByLabel('用户名', { exact: true }).fill('browser_editor')
    await dialog.getByLabel('密码', { exact: true }).fill('Isolated editor password 123!')
    await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
    await expect(dialog).not.toBeVisible()
    await page.goto('/admin/tiers')
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/admin/tier-lists') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '新建 Tier 榜单', exact: true }).click()
    const { id } = await (await created).json()
    const title = '浏览器验证榜单 ' + Date.now()
    await page.getByLabel('榜单标题', { exact: true }).fill(title)
    await page.getByLabel('榜单说明', { exact: true }).fill('以同好会作品书库整理主题推荐。')
    await page.getByLabel('第1层名称', { exact: true }).fill('最想推荐')
    await page.getByLabel('第1层颜色', { exact: true }).fill('#e8b8a1')
    await page.getByRole('button', { name: '添加魔法使之夜到榜单', exact: true }).click()
    await page.getByRole('button', { name: '添加CLANNAD到榜单', exact: true }).click()
    await page.getByLabel('移动CLANNAD到分层', { exact: true }).selectOption('a')
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '草稿已保存' })).toBeVisible()
    expect((await anonymous.get('/api/tier-lists/' + id)).status()).toBe(404)
    await page.getByRole('button', { name: '发布当前版本', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '榜单已发布' })).toBeVisible()
    const published = await (await anonymous.get('/api/tier-lists/' + id)).json()
    expect(published.rows[0]).toMatchObject({ label: '最想推荐', color: '#e8b8a1', workIds: [3] })
    expect(published.rows[1].workIds).toEqual([10])
    await page.getByLabel('榜单标题', { exact: true }).fill(title + ' 草稿')
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '草稿已保存' })).toBeVisible()
    expect((await (await anonymous.get('/api/tier-lists/' + id)).json()).title).toBe(title)
    await page.reload()
    await page.getByRole('button', { name: title + ' 草稿 · 有公开版本', exact: true }).click()
    await expect(page.getByLabel('榜单标题', { exact: true })).toHaveValue(title + ' 草稿')
    await page.getByRole('link', { name: '查看公开版本 ↗', exact: true }).click()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: '最想推荐层', exact: true })).toContainText('魔法使之夜')
    await page.screenshot({ path: test.info().outputPath('published-tier-board.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/admin/tiers')
    await page.getByRole('button', { name: title + ' 草稿 · 有公开版本', exact: true }).click()
    await page.getByRole('button', { name: '下架公开榜单', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '榜单已下架' })).toBeVisible()
    expect((await anonymous.get('/api/tier-lists/' + id)).status()).toBe(404)
    await page.goto('/admin/works')
    await page.getByRole('button', { name: '魔法使之夜', exact: true }).click()
    await page.getByLabel('书库简介', { exact: true }).fill('浏览器修改后的社团推荐语。')
    await page.getByRole('button', { name: '保存作品资料', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '作品资料已保存' })).toBeVisible()
    await page.getByRole('link', { name: '查看作品 ↗', exact: true }).click()
    await expect(page.locator('.work-description')).toHaveText('浏览器修改后的社团推荐语。')
  } finally {
    await anonymous.dispose()
  }
})
