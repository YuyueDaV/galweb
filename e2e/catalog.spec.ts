import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

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
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/test.jpg',
    score: 8.9,
    ratingCount: 100,
    tags: ['视觉小说'],
    syncedAt: Date.now(),
  }
  try {
    const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
    const cover = await sharp({ create: { width: 80, height: 110, channels: 3, background: '#d9b6a1' } })
      .webp()
      .toBuffer()
    let directRequests = 0
    await page.route('https://lain.bgm.tv/**', (route) => {
      directRequests++
      return route.abort()
    })
    let firstCover = true
    await page.route('**/api/bangumi/cover?*', (route) => {
      if (firstCover) {
        firstCover = false
        return route.fulfill({ status: 502, json: { message: '封面网络暂时中断' } })
      }
      return route.fulfill({ contentType: 'image/webp', body: cover })
    })
    await page.route('**/api/bangumi/search?*', (route) =>
      route.fulfill({ json: { items: [subject], total: 1, page: 1 } }),
    )
    await page.goto('/works')
    await page.getByLabel('Bangumi 作品名称', { exact: true }).fill('CLANNAD')
    await page.getByRole('button', { name: '搜索 Bangumi', exact: true }).click()
    await expect(page.locator('.bangumi-result')).toContainText('Bangumi 8.9')
    await page.getByRole('button', { name: '重试CLANNAD封面', exact: true }).click()
    await expect(page.locator('.bangumi-result img')).toHaveAttribute('src', /^\/api\/bangumi\/cover\?image=/)
    await expect
      .poll(() => page.locator('.bangumi-result img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(80)
    expect(directRequests).toBe(0)
    await expect(
      page.locator('.bangumi-result').getByRole('link', { name: '查看 Bangumi ↗' }),
    ).toHaveAttribute('href', 'https://bgm.tv/subject/13')
    await expect(page.getByRole('button', { name: '收录到书库', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '已收录 · 查看作品', exact: true }).click()
    const existingDialog = page.getByRole('dialog', { name: '作品已收录', exact: true })
    await expect(existingDialog).toContainText('CLANNAD')
    await existingDialog.getByRole('button', { name: '继续添加', exact: true }).click()
    await expect(page.getByLabel('Bangumi 作品名称', { exact: true })).toHaveValue('')
    await page.getByLabel('Bangumi 作品名称', { exact: true }).fill('CLANNAD')
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
    await expect(page.locator('[data-tier-work="3"]')).toContainText('魔法使之夜')
    await expect(page.getByRole('heading', { name: '同好们的分层选择', exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('published-tier-board.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/admin/tiers')
    await page.getByRole('button', { name: title + ' 草稿 · 有公开版本', exact: true }).click()
    await page.getByRole('button', { name: '下架公开榜单', exact: true }).click()
    const unpublishDialog = page.getByRole('dialog', { name: '下架公开榜单？', exact: true })
    await expect(unpublishDialog).toBeVisible()
    await unpublishDialog.getByRole('button', { name: '暂不下架', exact: true }).click()
    expect((await anonymous.get('/api/tier-lists/' + id)).status()).toBe(200)
    await page.getByRole('button', { name: '下架公开榜单', exact: true }).click()
    await unpublishDialog.getByRole('button', { name: '确认下架', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '榜单已下架' })).toBeVisible()
    expect((await anonymous.get('/api/tier-lists/' + id)).status()).toBe(404)
    await page.goto('/admin/works')
    await expect(page.getByRole('link', { name: '手动添加', exact: true })).toHaveAttribute(
      'href',
      '/works/new',
    )
    const catalog = await (await page.request.get('/api/works')).json()
    const initialIds = catalog.map((work: { rank: number }) => work.rank)
    const rows = page.locator('.catalog-order-row')
    await expect(rows).toHaveCount(initialIds.length)
    await page
      .getByRole('button', { name: '拖拽排序' + catalog[0].title, exact: true })
      .dragTo(page.locator(`[data-work-id="${initialIds[1]}"]`))
    await expect(page.getByRole('button', { name: '保存排序', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '保存排序', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '书库顺序已保存' })).toBeVisible()
    const expectedIds = [initialIds[1], initialIds[0], ...initialIds.slice(2)]
    await page.reload()
    await expect
      .poll(() => rows.evaluateAll((items) => items.map((item) => Number(item.getAttribute('data-work-id')))))
      .toEqual(expectedIds)
    await page.getByRole('button', { name: '上移' + catalog[0].title, exact: true }).click()
    await page.getByRole('button', { name: '撤销排序', exact: true }).click()
    await expect(page.getByRole('button', { name: '保存排序', exact: true })).toBeDisabled()
    await page.goto('/works')
    await expect(page.locator('.work-card').first()).toHaveAttribute('href', '/works/' + expectedIds[0])
    await page.getByLabel('按会社查找', { exact: true }).selectOption('nitroplus')
    const expectedNitro = catalog.filter((work: { studio?: string; bangumi?: { studio?: string } }) =>
      (work.studio || work.bangumi?.studio || '')
        .split(/[/／、;；]/)
        .some((name) => name.trim().toLowerCase() === 'nitroplus'),
    )
    await expect(page.locator('.work-card')).toHaveCount(Math.min(expectedNitro.length, 24))
    await page.getByLabel('搜索作品', { exact: true }).fill('没有匹配作品_测试')
    await page.getByRole('button', { name: '查看全部作品', exact: true }).click()
    await expect(page.getByLabel('按会社查找', { exact: true })).toHaveValue('')
    await expect(page.locator('.work-card')).toHaveCount(Math.min(catalog.length, 24))
    await expect(page.locator('.library-page-summary')).toContainText(`共 ${catalog.length} 部`)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByLabel('按会社查找', { exact: true }).selectOption('nitroplus')
    await page.locator('.library-toolbar').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await page.screenshot({ path: test.info().outputPath('company-filter-mobile.png') })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto('/admin/works')
    await page.getByRole('button', { name: '魔法使之夜', exact: true }).click()
    await page.getByLabel('书库简介', { exact: true }).fill('浏览器修改后的社团推荐语。')
    await page.getByLabel('更换作品封面', { exact: true }).setInputFiles({
      name: 'admin-cover.webp',
      mimeType: 'image/webp',
      buffer: cover,
    })
    await expect(page.getByRole('status').filter({ hasText: '作品封面已更新' })).toBeVisible()
    const customCover = await page
      .getByRole('img', { name: '魔法使之夜当前封面', exact: true })
      .getAttribute('src')
    expect(customCover).toMatch(/^\/api\/assets\//)
    await expect(page.getByLabel('书库简介', { exact: true })).toHaveValue('浏览器修改后的社团推荐语。')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.work-cover-editor').scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await page.screenshot({ path: test.info().outputPath('admin-cover-mobile.png'), fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: '保存作品资料', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '作品资料已保存' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: '魔法使之夜', exact: true }).click()
    await expect(page.getByRole('img', { name: '魔法使之夜当前封面', exact: true })).toHaveAttribute(
      'src',
      customCover!,
    )
    await page.getByRole('link', { name: '查看作品 ↗', exact: true }).click()
    await expect(page.locator('.work-description')).toHaveText('浏览器修改后的社团推荐语。')
    await expect(page.locator('.work-detail-cover img')).toHaveAttribute('src', customCover!)
    await page.goto('/admin/works')
    await page.getByRole('button', { name: '魔法使之夜', exact: true }).click()
    await page.getByRole('button', { name: '恢复默认封面', exact: true }).click()
    const resetDialog = page.getByRole('dialog', { name: '恢复作品封面？', exact: true })
    await resetDialog.getByRole('button', { name: '保留当前封面', exact: true }).click()
    await expect(page.getByRole('img', { name: '魔法使之夜当前封面', exact: true })).toHaveAttribute(
      'src',
      customCover!,
    )
    await page.getByRole('button', { name: '恢复默认封面', exact: true }).click()
    await resetDialog.getByRole('button', { name: '确认恢复', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '作品封面已更新' })).toBeVisible()
    await expect(page.getByRole('img', { name: '魔法使之夜当前封面', exact: true })).not.toHaveAttribute(
      'src',
      customCover!,
    )
    const identity = await (await page.request.get('/api/auth/me')).json()
    const deleteTitle = '待删除的书库作品 ' + Date.now()
    const added = await page.request.post('/api/works', {
      headers: { Origin: origin, 'X-CSRF-Token': identity.csrfToken },
      data: { title: deleteTitle },
    })
    expect(added.ok()).toBeTruthy()
    const deleteWork = await added.json()
    await page.reload()
    await page.getByRole('button', { name: deleteTitle, exact: true }).click()
    await page.getByRole('button', { name: '删除书库作品', exact: true }).click()
    const deleteDialog = page.getByRole('dialog', { name: '删除书库作品？', exact: true })
    await expect(deleteDialog).toContainText(deleteTitle)
    await expect(deleteDialog.getByRole('button', { name: '保留作品', exact: true })).toBeFocused()
    await deleteDialog.getByRole('button', { name: '保留作品', exact: true }).click()
    await expect(page.getByRole('button', { name: deleteTitle, exact: true })).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    await page.getByRole('button', { name: '删除书库作品', exact: true }).click()
    await deleteDialog.screenshot({ path: test.info().outputPath('delete-work-dark-mobile.png') })
    await deleteDialog.getByRole('button', { name: '确认删除', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: '已从书库删除' })).toContainText(deleteTitle)
    await expect(page.getByRole('button', { name: deleteTitle, exact: true })).toHaveCount(0)
    const remaining = await (await page.request.get('/api/works')).json()
    expect(remaining.some((item: { rank: number }) => item.rank === deleteWork.rank)).toBe(false)
    await page.goto('/works/' + deleteWork.rank)
    await expect(page.getByRole('status').filter({ hasText: '已移出公共书库' })).toBeVisible()
    await expect(page.getByLabel('更换作品封面', { exact: true })).toHaveCount(0)
  } finally {
    await anonymous.dispose()
  }
})
