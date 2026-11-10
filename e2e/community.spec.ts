import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

test('邮件注册、登录、发帖回复、收藏、头像上传、提名审核与投票持久化', async ({ page, playwright }) => {
  const username = 'pw_' + Date.now().toString(36)
  const password = 'Browser registration password 123!'
  // Reproduce browsers/proxies omitting Origin and Referer. Keep the same-origin
  // AJAX marker, then exercise the full mail/register/login/CSRF flow below.
  await page.route('**/api/auth/**', async (route) => {
    const headers = { ...route.request().headers() }
    delete headers.origin
    delete headers.referer
    delete headers['sec-fetch-site']
    await route.continue({ headers })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录' })
  await dialog.getByRole('button', { name: '邮箱注册', exact: true }).click()
  await dialog.getByLabel('用户名', { exact: true }).fill(username)
  await dialog.getByLabel('邮箱', { exact: true }).fill(username + '@example.com')
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByLabel('确认密码', { exact: true }).fill(password)
  const sent = page.waitForResponse((response) => response.url().endsWith('/api/auth/registration-code'))
  await dialog.getByRole('button', { name: '发送验证码', exact: true }).click()
  const { challengeId } = await (await sent).json()
  const active = JSON.parse(await readFile('.data/e2e/active.json', 'utf8'))
  const mail = JSON.parse(await readFile(path.join(active.cwd, '.data/mail', challengeId + '.json'), 'utf8'))
  await dialog.getByLabel('验证码', { exact: true }).fill(mail.text.match(/\d{6}/)[0])
  await dialog.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('注册成功')
  await dialog.getByLabel('密码', { exact: true }).fill('wrong password')
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('link', { name: '进入用户中心' })).toBeVisible()

  // Keep the full desktop navigation visible while checking its appearance.
  await page.setViewportSize({ width: 1440, height: 1600 })
  const write = page.getByRole('button', { name: '写点什么', exact: true })
  expect(await write.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none')
  expect((await write.boundingBox())!.height).toBeGreaterThanOrEqual(48)
  await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
  await write.scrollIntoViewIfNeeded()
  await expect(write).toBeInViewport()
  await page.screenshot({ path: test.info().outputPath('sidebar-page-dark.png') })
  await write.screenshot({ path: test.info().outputPath('sidebar-write-dark.png') })
  expect(await write.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none')
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click()
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.getByRole('button', { name: '写点什么', exact: true }).click()
  const composer = page.getByRole('dialog', { name: '把你的故事，留在这里。' })
  const title = '浏览器测试手记 ' + username
  await composer.getByLabel('帖子标题', { exact: true }).fill(title)
  await composer
    .getByLabel('帖子正文', { exact: true })
    .fill('这是一篇通过真实浏览器发布的阅读手记。\n\n**喜欢的故事，值得认真分享。**')
  await composer.getByRole('button', { name: '发布帖子', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const postUrl = page.url()
  await page.getByRole('button', { name: '收藏帖子', exact: true }).click()
  await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByPlaceholder('把你的感受，接在故事后面……').fill('这是一条通过浏览器发布并检查持久化的回复。')
  await page.getByRole('button', { name: '发布回复', exact: true }).click()
  await expect(page.locator('.reply-card')).toContainText('通过浏览器发布')
  await page.reload()
  await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.goto('/account')
  const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
  const image = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#d97542' } })
    .png()
    .toBuffer()
  await page
    .getByLabel('头像图片文件', { exact: true })
    .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('button', { name: '保存资料', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '保存资料', exact: true }).click()
  await expect(page.locator('.profile-form-bottom')).toContainText('个人资料已保存')
  await page.reload()
  await expect(page.locator('.avatar-picker img')).toHaveAttribute('src', /\/api\/assets\//)
  await expect(page.locator('.avatar-picker img')).toHaveJSProperty('naturalWidth', 128)

  const self = (await (await page.request.get('/api/auth/me')).json()).user
  const personalPath = '/user/' + self.id
  await expect(
    page.locator('.account-heading').getByRole('link', { name: '我的个人空间', exact: true }),
  ).toHaveAttribute('href', personalPath)
  await expect(
    page.locator('.profile-preview').getByRole('link', { name: '查看我的个人空间', exact: true }),
  ).toHaveAttribute('href', personalPath)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(
    page.locator('.account-shortcuts').getByRole('button', { name: '退出登录', exact: true }),
  ).toHaveCSS('background-image', 'none')
  await page
    .locator('.account-shortcuts')
    .screenshot({ path: test.info().outputPath('account-shortcuts-light-mobile.png') })
  await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
  await page
    .locator('.account-shortcuts')
    .screenshot({ path: test.info().outputPath('account-shortcuts-dark-mobile.png') })
  await page.getByRole('button', { name: '切换浅色模式', exact: true }).click()
  await page
    .locator('.account-heading')
    .screenshot({ path: test.info().outputPath('account-personal-space-mobile.png') })
  await page.locator('.account-heading').getByRole('link', { name: '我的个人空间', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(personalPath + '$'))
  await expect(page.locator('.member-identity h1')).toHaveText(self.nickname)
  await expect(page.locator('.member-content')).toContainText(title)
  await page.getByRole('link', { name: '进入用户中心', exact: true }).click()
  await page.locator('.profile-preview').getByRole('link', { name: '查看我的个人空间', exact: true }).click()
  await expect(page.locator('.member-identity h1')).toHaveText(self.nickname)
  await page.getByRole('button', { name: '展开社区导航', exact: true }).click()
  const spaceLink = page.locator('.personal-section').getByRole('link', { name: '我的个人空间', exact: true })
  await expect(spaceLink).toHaveClass(/selected/)
  await expect(spaceLink).toHaveAttribute('href', personalPath)
  await expect(
    page.locator('.left-sidebar').getByRole('link', { name: '社区广场', exact: true }),
  ).not.toHaveClass(/selected/)
  await spaceLink.click()
  await page.setViewportSize({ width: 1280, height: 900 })

  await page.goto('/awards?campaign=browser-voting')
  await page.getByRole('button', { name: '提交一份提名', exact: true }).click()
  const nomination = page.getByRole('dialog', { name: '替喜欢的作品，写一封推荐信。' })
  await nomination.getByRole('combobox', { name: '书库作品', exact: true }).selectOption('3')
  await expect(nomination.getByPlaceholder('输入作品名称，也可以提名书架之外的作品')).toHaveValue(
    '魔法使之夜',
  )
  await nomination
    .getByPlaceholder('哪一个瞬间，让你想把它推荐给大家？')
    .fill('演出、文字与音乐共同构成了值得分享的阅读体验。')
  const nominated = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/nominations'),
  )
  await nomination.getByRole('button', { name: '提交提名', exact: true }).click()
  const { id } = await (await nominated).json()
  await expect(nomination).not.toBeVisible()
  await expect(page.locator('.award-my-nominations')).toContainText('待审核')

  const editor = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:3117',
    extraHTTPHeaders: { Origin: 'http://127.0.0.1:3117' },
  })
  try {
    const login = await editor.post('/api/auth/login', {
      data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
    })
    expect(login.ok()).toBeTruthy()
    const { csrfToken } = await login.json()
    const headers = { 'X-CSRF-Token': csrfToken }
    expect(
      (
        await editor.patch('/api/award-campaigns/browser-voting/nominations/' + id, {
          headers,
          data: { status: 'approved', note: '' },
        })
      ).ok(),
    ).toBeTruthy()
    const current = await (await editor.get('/api/award-campaigns/browser-voting')).json()
    expect(
      (
        await editor.post('/api/admin/award-campaigns/browser-voting/transitions', {
          headers,
          data: { phase: 'voting', version: current.campaign.version },
        })
      ).ok(),
    ).toBeTruthy()
  } finally {
    await editor.dispose()
  }
  await page.reload()
  await page.getByRole('checkbox', { name: '投票给魔法使之夜', exact: true }).check()
  await page.getByRole('button', { name: '提交我的选票', exact: true }).click()
  await expect(page.locator('.award-ballot-bar')).toContainText('已提交')
  await page.getByRole('button', { name: '我的选票', exact: true }).click()
  await expect(page.getByRole('heading', { name: '你的喜欢，已经收到。', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.award-ballot-bar')).toContainText('已提交')
  await page.goto(postUrl)
  await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible()
})
