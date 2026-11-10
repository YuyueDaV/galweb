import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

test('刷新首屏直接显示本人账号；水合不重复检查，游客不接收他人状态', async ({ browser }) => {
  const origin = 'http://127.0.0.1:3117'
  const noScript = await browser.newContext({ baseURL: origin, javaScriptEnabled: false })
  const guest = await browser.newContext({ baseURL: origin, javaScriptEnabled: false })
  let hydrated: Awaited<ReturnType<typeof browser.newContext>> | undefined
  try {
    const signed = await noScript.request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_auth', password: 'Isolated moderator password 123!' },
    })
    expect(signed.ok()).toBeTruthy()
    const identity = await signed.json(),
      page = await noScript.newPage()
    const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
    const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#d97542' } })
      .png()
      .toBuffer()
    const upload = await noScript.request.post('/api/uploads', {
      headers: { Origin: origin, 'X-CSRF-Token': identity.csrfToken },
      multipart: { file: { name: 'session-avatar.png', mimeType: 'image/png', buffer: image } },
    })
    expect(upload.ok()).toBeTruthy()
    const avatar = await upload.json()
    expect(
      (
        await noScript.request.patch('/api/auth/me', {
          headers: { Origin: origin, 'X-CSRF-Token': identity.csrfToken },
          data: { avatarAssetId: avatar.id },
        })
      ).ok(),
    ).toBeTruthy()
    const response = await page.goto('/works')
    expect(response?.headers()['cache-control']).toContain('private')
    const accountLink = page.getByRole('link', { name: '进入用户中心', exact: true })
    await expect(accountLink).toContainText(identity.user.nickname)
    await expect(accountLink.locator('img')).toHaveJSProperty('naturalWidth', 40)
    await expect(page.getByRole('button', { name: '登录 / 加入', exact: true })).toHaveCount(0)
    await expect(page.locator('.service-notice')).toHaveCount(0)
    const html = await response!.text()
    expect(html).toContain(identity.user.id)
    const anonymous = await guest.newPage(),
      guestResponse = await anonymous.goto('/works')
    await expect(anonymous.getByRole('button', { name: '登录 / 加入', exact: true })).toBeVisible()
    expect(await guestResponse!.text()).not.toContain(identity.user.id)
    expect(await guestResponse!.text()).not.toContain(identity.csrfToken)

    hydrated = await browser.newContext({ baseURL: origin, storageState: await noScript.storageState() })
    const live = await hydrated.newPage()
    const requests: string[] = []
    await live.route('**/api/auth/{me,csrf}', async (route) => {
      requests.push(route.request().url())
      await route.continue()
    })
    await live.goto('/works')
    await expect(live.getByRole('link', { name: '进入用户中心', exact: true })).toContainText(
      identity.user.nickname,
    )
    await expect(live.locator('.app-loading')).toHaveCount(0)
    await live.reload()
    await expect(live.getByRole('link', { name: '进入用户中心', exact: true })).toContainText(
      identity.user.nickname,
    )
    await expect(live.getByRole('button', { name: '登录 / 加入', exact: true })).toHaveCount(0)
    await expect(live.locator('.app-loading')).toHaveCount(0)
    expect(requests).toHaveLength(0)

    // Let the SSR avatar fail before Vue loads, then verify the initials fallback after hydration.
    let releaseScripts!: () => void
    const scriptsReady = new Promise<void>((resolve) => {
      releaseScripts = resolve
    })
    await live.route('**/_nuxt/*.js', async (route) => {
      await scriptsReady
      await route.continue()
    })
    await live.route('**/api/assets/' + avatar.id, (route) => route.fulfill({ status: 404, body: '' }))
    try {
      await live.reload({ waitUntil: 'commit' })
      const liveAccount = live.getByRole('link', { name: '进入用户中心', exact: true })
      await expect(liveAccount.locator('img')).toHaveJSProperty('complete', true)
      await expect(liveAccount.locator('img')).toHaveJSProperty('naturalWidth', 0)
      releaseScripts()
      await expect(liveAccount.locator('img')).toHaveCount(0)
      await expect(liveAccount.locator('.user-avatar')).toHaveText('b')
    } finally {
      releaseScripts()
    }
  } finally {
    await noScript.close()
    await guest.close()
    await hydrated?.close()
  }
})
