import { test, expect } from '@playwright/test'

test('手机登录框同时支持用户名和邮箱，大小写空白兼容、登录持久化及失败提示', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const loginEntry = page.getByRole('banner').getByRole('button', { name: '登录 / 加入', exact: true })
  let accountId = ''
  for (const identifier of ['browser_auth', '  BROWSER_AUTH@EXAMPLE.COM  ']) {
    await loginEntry.click()
    const dialog = page.getByRole('dialog', { name: '账号与登录' })
    const account = dialog.getByLabel('用户名或邮箱', { exact: true })
    await expect(account).toHaveAttribute('maxlength', '254')
    await account.fill(identifier)
    await dialog.getByLabel('密码', { exact: true }).fill('Isolated moderator password 123!')
    await dialog.screenshot({
      path: test.info().outputPath(identifier.includes('@') ? 'email-mobile.png' : 'username-mobile.png'),
    })
    await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('link', { name: '进入用户中心', exact: true })).toContainText('browser_auth')
    await page.reload()
    const profile = await (await page.request.get('/api/auth/me')).json()
    if (accountId) expect(profile.user.id).toBe(accountId)
    accountId = profile.user.id
    await page.goto('/account')
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(loginEntry).toBeVisible()
  }
  await loginEntry.click()
  const dialog = page.getByRole('dialog', { name: '账号与登录' })
  await dialog.getByLabel('用户名或邮箱', { exact: true }).fill('browser_auth@example.com')
  await dialog.getByLabel('密码', { exact: true }).fill('wrong password')
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog.getByRole('alert')).toContainText('账号或密码错误')
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})
