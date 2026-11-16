import { test, expect } from '@playwright/test'

const origin = 'http://127.0.0.1:3117'
const options = [
  { provider: 'qq', label: 'QQ', enabled: true },
  { provider: 'discord', label: 'Discord', enabled: true },
]
const bindings = options.map((option) => ({
  ...option,
  bound: option.provider === 'qq',
  displayName: option.provider === 'qq' ? 'QQ 同好' : '',
  boundAt: null,
}))

test('未配置时保留邮箱登录；配置后手机端可选择 QQ 和 Discord，发起授权保留返回页', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: '登录 / 加入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录' })
  await expect(dialog.getByRole('button', { name: 'QQ 登录', exact: true })).toHaveCount(0)
  const disabled = await page.request.post('/api/auth/oauth/qq/start', {
    headers: { Origin: origin },
    data: { mode: 'login', returnTo: '/account' },
  })
  expect(disabled.status()).toBe(503)
  expect(
    (
      await page.request.post('/api/auth/oauth/qq/start', {
        headers: { Origin: 'https://foreign.example' },
        data: { mode: 'login', returnTo: '/account' },
      })
    ).status(),
  ).toBe(403)
  await page.route('**/api/auth/oauth/providers', (route) => route.fulfill({ json: options }))
  await page.reload()
  await page.getByRole('banner').getByRole('button', { name: '登录 / 加入', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'QQ 登录', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Discord 登录', exact: true })).toBeVisible()
  const button = dialog.getByRole('button', { name: 'QQ 登录', exact: true })
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  expect(await button.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await dialog.screenshot({ path: test.info().outputPath('social-login-mobile.png') })
  let input: unknown
  await page.route('**/api/auth/oauth/qq/start', async (route) => {
    input = route.request().postDataJSON()
    await route.fulfill({ json: { url: 'https://graph.qq.com/oauth2.0/authorize?state=fixture' } })
  })
  await page.route('https://graph.qq.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>QQ 授权测试</title>' }),
  )
  await button.click()
  await expect(page).toHaveURL(/graph\.qq\.com\/oauth2\.0\/authorize/)
  expect(input).toEqual({ mode: 'login', returnTo: '/' })
})

test('用户中心展示绑定、解绑确认与失败提示，第三方用户可补充邮箱密码', async ({ page }) => {
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username: 'browser_social', password: 'Isolated moderator password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  const session = await signed.json()
  let user = { ...session.user, email: null, hasPassword: false }
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { user, csrfToken: session.csrfToken } }),
  )
  await page.route('**/api/auth/oauth/bindings', (route) => route.fulfill({ json: bindings }))
  await page.goto('/account?oauth=login&oauth_provider=qq&oauth_message=QQ%20登录成功。')
  const notice = page.getByRole('dialog', { name: '登录成功', exact: true })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: '继续浏览', exact: true }).click()
  await expect(page).toHaveURL('/account')
  const section = page.getByRole('region', { name: '登录方式与账号绑定' })
  await expect(section).toContainText('已绑定 · QQ 同好')
  await expect(section.getByRole('button', { name: '绑定 Discord', exact: true })).toBeVisible()
  await page.route('**/api/auth/oauth/qq', (route) =>
    route.fulfill({ status: 409, json: { message: '请先设置邮箱和密码，或绑定另一种登录方式，再解绑。' } }),
  )
  await section.getByRole('button', { name: '解绑 QQ', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '解绑 QQ？', exact: true })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '确认解绑', exact: true }).click()
  await expect(section.getByRole('alert')).toContainText('先设置邮箱和密码')
  await section.getByLabel('邮箱', { exact: true }).fill('completed@example.com')
  await page.route('**/api/auth/registration-code', (route) =>
    route.fulfill({
      json: {
        challengeId: '11111111-1111-4111-8111-111111111111',
        retryAfter: 60,
        message: '验证码已发送，请检查邮箱。',
      },
    }),
  )
  await section.getByRole('button', { name: '发送验证码', exact: true }).click()
  await expect(section.getByRole('status')).toContainText('验证码已发送')
  await section.getByLabel('邮箱验证码', { exact: true }).fill('123456')
  await section.getByLabel('设置密码', { exact: true }).fill('Completed social password 123!')
  await section.getByLabel('确认密码', { exact: true }).fill('Different social password 123!')
  await section.getByRole('button', { name: '保存邮箱和密码', exact: true }).click()
  await expect(section.getByRole('alert')).toContainText('两次输入的密码不一致')
  await section.getByLabel('确认密码', { exact: true }).fill('Completed social password 123!')
  await page.route('**/api/auth/credentials', async (route) => {
    expect(route.request().headers()['x-csrf-token']).toBe(session.csrfToken)
    expect(route.request().postDataJSON().email).toBe('completed@example.com')
    user = { ...user, email: 'completed@example.com', hasPassword: true }
    await route.fulfill({ json: { user } })
  })
  await section.getByRole('button', { name: '保存邮箱和密码', exact: true }).click()
  await expect(section.getByRole('status')).toContainText('邮箱和密码已设置')
  await expect(section.getByRole('heading', { name: '补充邮箱与密码' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '注销我的账号', exact: true })).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  await section.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await section.screenshot({ path: test.info().outputPath('social-bindings-mobile.png') })
  let input: unknown
  await page.route('**/api/auth/oauth/discord/start', async (route) => {
    input = route.request().postDataJSON()
    await route.fulfill({ json: { url: 'https://discord.com/oauth2/authorize?state=fixture' } })
  })
  await page.route('https://discord.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Discord 授权测试</title>' }),
  )
  await section.getByRole('button', { name: '绑定 Discord', exact: true }).click()
  await expect(page).toHaveURL(/discord\.com\/oauth2\/authorize/)
  expect(input).toEqual({ mode: 'bind', returnTo: '/account' })
})

test('授权失败显示弹窗、清理回调参数，游客可以重新打开登录', async ({ page }) => {
  await page.goto(
    '/account?oauth=error&oauth_provider=discord&oauth_message=' +
      encodeURIComponent('该第三方账号已绑定其他账号，请先在原账号中解绑。'),
  )
  const notice = page.getByRole('dialog', { name: '授权未完成', exact: true })
  await expect(notice).toContainText('已绑定其他账号')
  await expect(page).toHaveURL('/account')
  await notice.getByRole('button', { name: '去登录', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '账号与登录' })).toBeVisible()
})
