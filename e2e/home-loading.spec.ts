import { test, expect } from '@playwright/test'

test('首页复用 SSR 配置、只加载一次帖子与话题，弹窗打开前不挂载编辑器', async ({ page }) => {
  const calls = { settings: 0, posts: 0, topics: 0 }
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/site-settings') calls.settings++
    if (path === '/api/posts') calls.posts++
    if (path === '/api/topics') calls.topics++
  })
  await page.goto('/')
  await expect(page.locator('.post-list')).toBeVisible()
  await expect(page.locator('.topics-card')).not.toContainText('正在加载话题')
  expect(calls).toEqual({ settings: 0, posts: 1, topics: 1 })
  await expect(page.locator('.markdown-editor')).toHaveCount(0)
  await expect(page.locator('.topic-picker')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '账号与登录' }).locator('form')).toHaveCount(0)
  await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录' })
  await expect(dialog.getByLabel('用户名或邮箱', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭登录窗口' }).click()

  // Searching refreshes the post list without refetching topics or site settings.
  await page.getByRole('button', { name: '打开搜索', exact: true }).click()
  await page.getByLabel('搜索帖子和作品').fill('不存在的检索词')
  await expect.poll(() => calls.posts).toBe(2)
  await expect(page.locator('.post-list .empty-state')).toBeVisible()
  expect(calls.topics).toBe(1)
})
