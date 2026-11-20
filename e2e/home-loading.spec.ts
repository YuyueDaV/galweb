import { test, expect } from './fixtures'

test('首页复用 SSR 配置、只加载一次帖子与话题，弹窗打开前不挂载编辑器', async ({ page }) => {
  const calls = { settings: 0, posts: 0, topics: 0 }
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path === '/api/site-settings') calls.settings++
    if (path === '/api/posts') calls.posts++
    if (path === '/api/topics') calls.topics++
  })
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) => url.pathname === '/api/posts',
    async (route) => {
      await pending
      await route.continue()
    },
    { times: 1 },
  )
  try {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /广场里的新鲜事/ })).toBeVisible()
    const skeleton = page.locator('.feed-skeleton')
    await expect(skeleton).toBeVisible()
    await expect(skeleton.locator('.feed-skeleton-row[aria-hidden="true"]')).toHaveCount(3)
    await expect(page.locator('.post-card')).toHaveCount(0)
  } finally {
    release()
  }
  await expect(page.locator('.post-list')).toBeVisible()
  await expect(page.locator('.feed-skeleton')).toHaveCount(0)
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

test('手机按压有反馈，成功点赞才轻弹，减少动态时仍可收藏', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  try {
    const page = await context.newPage()
    const login = await page.request.post('/api/auth/login', {
      headers: { Origin: baseURL! },
      data: { username: 'browser_loading', password: 'Isolated moderator password 123!' },
    })
    expect(login.ok()).toBeTruthy()
    await page.addInitScript(() => {
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
        if (this.matches('.detail-actions .app-icon')) this.setAttribute('data-feedback', 'played')
        return animate.apply(this, args)
      }
    })
    await page.goto('/')
    await expect(page.locator('.app-loading')).toHaveCount(0)
    const card = page.locator('.category-card').first()
    await card.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
    const box = (await card.boundingBox())!
    const touch = await context.newCDPSession(page)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    })
    await expect(card).toHaveAttribute('data-touch-pressed', '')
    await expect(card).toHaveCSS('scale', '0.97')
    await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    await expect(card).not.toHaveAttribute('data-touch-pressed')
    await expect(card).toHaveCSS('scale', 'none')
    await expect(card).toHaveAttribute('aria-pressed', 'false')

    await page.goto('/post/welcome')
    const like = page.locator('.detail-actions .button[aria-pressed]')
    const likeIcon = like.locator('.app-icon')
    await page.route(
      '**/api/posts/welcome/reactions',
      (route) => route.fulfill({ status: 503, json: { message: '测试暂时无法点赞。' } }),
      { times: 1 },
    )
    await like.tap()
    await expect(page.getByRole('status').filter({ hasText: '测试暂时无法点赞。' })).toBeVisible()
    await expect(like).toHaveAttribute('aria-pressed', 'false')
    expect(await likeIcon.getAttribute('data-feedback')).toBeNull()
    await like.tap()
    await expect(like).toHaveAttribute('aria-pressed', 'true')
    await expect(likeIcon).toHaveAttribute('data-feedback', 'played')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const bookmark = page.locator('.detail-actions .text-link[aria-pressed]')
    await bookmark.tap()
    await expect(bookmark).toHaveAttribute('aria-pressed', 'true')
    expect(await bookmark.locator('.app-icon').getAttribute('data-feedback')).toBeNull()
  } finally {
    await context.close()
  }
})
