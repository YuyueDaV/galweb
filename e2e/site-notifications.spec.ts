import { test, expect } from '@playwright/test'

test('管理员群发预览、失败重试和防重；成员收件、独立已读与活动自动通知', async ({ page, browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const headers = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
  const member = await browser.newContext({ baseURL: origin })
  try {
    const login = await member.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_member', password: 'Isolated moderator password 123!' },
    })
    const memberHeaders = { Origin: origin, 'X-CSRF-Token': (await login.json()).csrfToken }
    expect((await member.request.get('/api/admin/notifications')).status()).toBe(403)
    expect(
      (
        await member.request.post('/api/admin/notifications', {
          headers: memberHeaders,
          data: { requestId: crypto.randomUUID(), title: '越权', content: '不应送达', link: '' },
        })
      ).status(),
    ).toBe(403)
    const reader = await member.newPage()
    await reader.goto('/admin/notifications')
    await expect(reader.getByText('只有管理员和超级管理员可以发送站点通知。')).toBeVisible()
    await expect(reader.getByRole('button', { name: '预览通知', exact: true })).toHaveCount(0)
    await page.goto('/admin/notifications')
    const title = '全站消息 ' + Date.now(),
      content = '大家好，欢迎来参与我们的活动！\n这是一条完整的多行通知。'
    await page.getByLabel('通知标题', { exact: true }).fill(title)
    await page.getByLabel('通知正文', { exact: true }).fill(content)
    await page.getByRole('button', { name: '预览通知', exact: true }).click()
    await expect(page.getByRole('region', { name: '通知预览' })).toContainText(content)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await page
      .locator('.notice-composer')
      .screenshot({ path: test.info().outputPath('notice-preview-mobile.png') })
    await page.route('**/api/admin/notifications', (route) =>
      route.fulfill({ status: 503, json: { message: '测试发送失败，请重试。' } }),
    )
    await page.getByRole('button', { name: '确认发送给全体用户', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('测试发送失败')
    await page.unroute('**/api/admin/notifications')
    const sent = page.waitForResponse(
      (r) => r.url().endsWith('/api/admin/notifications') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '确认发送给全体用户', exact: true }).click()
    const response = await sent,
      notice = await response.json()
    expect(response.ok()).toBeTruthy()
    await expect(page.getByRole('status').filter({ hasText: '通知已发送' })).toBeVisible()
    expect(notice.recipientCount).toBeGreaterThanOrEqual(4)
    const retry = await page.request.post('/api/admin/notifications', {
      headers,
      data: response.request().postDataJSON(),
    })
    expect((await retry.json()).id).toBe(notice.id)
    const inbox = await (await member.request.get('/api/notifications')).json()
    expect(inbox.items.filter((n: { id: string }) => n.id === notice.id)).toHaveLength(1)
    await reader.goto('/notifications')
    const item = reader.locator('.inbox-item').filter({ hasText: title })
    await expect(item).toContainText(content)
    await expect(item).toHaveClass(/unread/)
    await expect(item.locator('.notification-title')).toHaveCSS('background-image', 'none')
    await expect(item.locator('.notification-title')).toHaveCSS('box-shadow', 'none')
    await reader.setViewportSize({ width: 390, height: 844 })
    await item.screenshot({ path: test.info().outputPath('site-notice-light-mobile.png') })
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy()
    await item.getByRole('button', { name: '标为已读', exact: true }).click()
    await expect(item).not.toHaveClass(/unread/)
    const ownInbox = await (await page.request.get('/api/notifications')).json()
    expect(ownInbox.items.find((n: { id: string }) => n.id === notice.id).readAt).toBeNull()
    await reader.setViewportSize({ width: 390, height: 844 })
    await reader.getByRole('button', { name: '切换深色模式' }).click()
    await item.screenshot({ path: test.info().outputPath('site-notice-dark-mobile.png') })

    const created = await page.request.post('/api/admin/award-campaigns', { headers, data: {} })
    expect(created.ok(), await created.text()).toBeTruthy()
    const campaign = await created.json()
    const event = '/api/admin/award-campaigns/' + campaign.id + '/transitions'
    expect(
      (
        await page.request.post(event, { headers, data: { phase: 'nomination', version: campaign.version } })
      ).ok(),
    ).toBeTruthy()
    expect(
      (
        await page.request.post(event, { headers, data: { phase: 'nomination', version: campaign.version } })
      ).status(),
    ).toBe(409)
    await reader.reload()
    const activity = reader.locator('.inbox-item').filter({ hasText: campaign.title + ' · 开放提名' })
    await expect(activity).toHaveCount(1)
    await expect(activity).toHaveClass(/unread/)
    await activity.getByRole('button', { name: '查看详情 ↗', exact: true }).click()
    await expect(reader).toHaveURL(/\/awards\?campaign=/)
    expect(new URL(reader.url()).searchParams.get('campaign')).toBe(campaign.id)
  } finally {
    await member.close()
  }
})
