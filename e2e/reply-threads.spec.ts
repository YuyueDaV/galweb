import { test, expect, type BrowserContext } from '@playwright/test'

test('评论回复在原评论下聚合，通知显示原留言并定位新回复，隐藏原文不泄漏', async ({ browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const contexts: BrowserContext[] = []
  async function account(username: string, mobile = false) {
    const context = await browser.newContext({
      baseURL: origin,
      viewport: { width: mobile ? 390 : 1440, height: 1000 },
      isMobile: mobile,
      hasTouch: mobile,
    })
    contexts.push(context)
    const response = await context.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username, password: 'Isolated moderator password 123!' },
    })
    expect(response.ok()).toBeTruthy()
    return {
      context,
      headers: { Origin: origin, 'X-CSRF-Token': (await response.json()).csrfToken },
      page: await context.newPage(),
    }
  }
  try {
    const author = await account('browser_thread_author'),
      member = await account('browser_thread_member', true),
      other = await account('browser_thread_other')
    const title = '有上下文的评论通知 ' + Date.now()
    const post = await (
      await author.context.request.post('/api/posts', {
        headers: author.headers,
        data: { title, content: '在这篇帖子中检查多位同好的评论对话。', category: '同好闲聊', image: 2 },
      })
    ).json()
    const endpoint = '/api/posts/' + post.id + '/replies'
    const first = await (
      await member.context.request.post(endpoint, {
        headers: member.headers,
        data: { content: '最初的一条评论，晚安。' },
      })
    ).json()
    const second = await (
      await other.context.request.post(endpoint, {
        headers: other.headers,
        data: { content: '你也是，祝好梦。', parentId: first.id },
      })
    ).json()
    await other.context.request.post(endpoint, {
      headers: other.headers,
      data: { content: '这是另一条独立评论。' },
    })
    await member.page.goto('/post/' + post.id)
    const thread = member.page.locator(`.reply-thread[data-thread-id="${first.id}"]`)
    await expect(member.page.locator('.reply-thread')).toHaveCount(2)
    await expect(thread.locator('.reply-card')).toHaveCount(2)
    await thread
      .locator('#reply-' + second.id)
      .getByRole('button', { name: '回复这条留言', exact: true })
      .click()
    await expect(member.page.locator('.reply-target-excerpt')).toHaveText('你也是，祝好梦。')
    await member.page
      .locator('.reply-form')
      .screenshot({ path: test.info().outputPath('reply-composer-mobile.png') })
    await member.page.setViewportSize({ width: 1440, height: 1000 })
    await member.page
      .locator('.reply-form')
      .screenshot({ path: test.info().outputPath('reply-composer-desktop.png') })
    await member.page.setViewportSize({ width: 390, height: 1000 })
    await member.page.getByLabel(/也来说两句/).fill('谢谢，这也是对上一条回复的回应。')
    const submitted = member.page.waitForResponse(
      (r) => r.url().endsWith(endpoint) && r.request().method() === 'POST',
    )
    await member.page.getByRole('button', { name: '发布回复', exact: true }).click()
    const third = await (await submitted).json()
    await expect(member.page).toHaveURL(new RegExp('#reply-' + third.id + '$'))
    await expect(thread.locator('.reply-card')).toHaveCount(3)
    await expect(thread.locator('#reply-' + third.id + ' .reply-context')).toContainText(
      'browser_thread_other',
    )
    await thread.screenshot({ path: test.info().outputPath('reply-thread-mobile.png') })
    expect(
      await member.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBeTruthy()
    await member.page.reload()
    await expect(thread.locator('.reply-card')).toHaveCount(3)
    const fourth = await (
      await other.context.request.post(endpoint, {
        headers: other.headers,
        data: { content: '展开区的另一条回复。', parentId: first.id },
      })
    ).json()
    const fifth = await (
      await member.context.request.post(endpoint, {
        headers: member.headers,
        data: { content: '这是折叠区中的最后回复。', parentId: fourth.id },
      })
    ).json()
    await member.page.reload()
    await expect(thread.locator('.reply-card')).toHaveCount(4)
    await expect(thread.locator('#reply-' + fifth.id)).toHaveCount(0)
    await thread.getByRole('button', { name: '共 4 条回复，点击查看', exact: true }).click()
    await expect(thread.locator('.reply-card')).toHaveCount(5)
    await thread.getByRole('button', { name: '收起回复', exact: true }).click()
    await expect(thread.locator('.reply-card')).toHaveCount(4)
    await member.page.goto('/post/' + post.id + '#reply-' + fifth.id)
    await expect(thread.locator('.reply-card')).toHaveCount(5)
    await expect(thread.locator('#reply-' + fifth.id)).toBeInViewport()
    await member.page.setViewportSize({ width: 320, height: 844 })
    expect(
      await member.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBeTruthy()
    await other.page.goto('/notifications')
    const notice = other.page
      .locator('.inbox-item')
      .filter({ hasText: title })
      .filter({ hasText: '这是折叠区中的最后回复' })
    await expect(notice).toHaveCount(1)
    await expect(notice.locator('.notification-action')).toHaveText('回复了我的评论')
    await expect(notice.locator('.notification-quote')).toHaveText('展开区的另一条回复。')
    await expect(notice.locator('.notification-excerpt')).toHaveText('这是折叠区中的最后回复。')
    await expect(notice.locator('.notification-source img')).toBeVisible()
    await notice.screenshot({ path: test.info().outputPath('reply-notification-desktop.png') })
    await other.page.setViewportSize({ width: 390, height: 844 })
    await other.page.getByRole('button', { name: '切换深色模式' }).click()
    await notice.screenshot({ path: test.info().outputPath('reply-notification-mobile-dark.png') })
    expect(
      await other.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBeTruthy()
    await notice.getByRole('button', { name: '回复这条消息', exact: true }).click()
    await expect(other.page.locator('.reply-target-excerpt')).toHaveText('这是折叠区中的最后回复。')
    await other.page.locator('.reply-target').getByRole('button', { name: '取消', exact: true }).click()
    await other.page.goto('/notifications')
    await notice.getByRole('button', { name: '查看回复', exact: true }).click()
    await expect(other.page).toHaveURL(new RegExp('/post/' + post.id + '#reply-' + fifth.id + '$'))
    await expect(other.page.locator('.reply-card.is-target')).toHaveAttribute('id', 'reply-' + fifth.id)
    await expect(other.page.locator('#reply-' + fifth.id)).toBeInViewport()
    const highlighted = other.page.locator('#reply-' + fifth.id)
    await expect(highlighted).toHaveCSS('animation-duration', '1s')
    await expect(highlighted).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 2500 })
    await expect(highlighted).toHaveCSS('box-shadow', /rgba\(0, 0, 0, 0\)/)
    await expect(highlighted).toHaveCSS('opacity', '1')
    await other.page.emulateMedia({ reducedMotion: 'reduce' })
    await other.page.reload()
    await expect(other.page.locator('.reply-card.is-target')).toHaveAttribute('id', 'reply-' + fifth.id)
    await expect(highlighted).toHaveCSS('animation-name', 'none')
    await expect(highlighted).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)', { timeout: 2500 })
    for (const id of [first.id, second.id, fourth.id]) {
      const response = await author.context.request.patch('/api/admin/replies/' + id, {
        headers: author.headers,
        data: { status: 'hidden' },
      })
      expect(response.ok()).toBeTruthy()
    }
    await member.page.reload()
    await expect(thread.locator('.reply-unavailable')).toBeVisible()
    await expect(thread.locator('.reply-card')).toHaveCount(2)
    await expect(thread).not.toContainText('最初的一条评论，晚安。')
    await expect(thread).not.toContainText('你也是，祝好梦。')
    await other.page.goto('/notifications')
    await expect(notice.locator('.notification-quote')).toHaveText('原留言已隐藏或删除。')
    await expect(notice).not.toContainText('展开区的另一条回复。')
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
  }
})
