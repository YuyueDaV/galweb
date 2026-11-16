import { test, expect, type Browser, type Page } from './fixtures'

const origin = 'http://127.0.0.1:3117'
const username = 'browser_member'
const password = 'Isolated moderator password 123!'

async function login(page: Page) {
  const dialog = page.getByRole('dialog', { name: '账号与登录', exact: true })
  await dialog.getByLabel('用户名或邮箱', { exact: true }).fill(username)
  await dialog.getByLabel('密码', { exact: true }).fill(password)
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog).not.toBeVisible()
}

async function campaignFixture(browser: Browser, voting: boolean) {
  const context = await browser.newContext()
  try {
    const signed = await context.request.post(origin + '/api/auth/login', {
      headers: { Origin: origin },
      data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
    })
    expect(signed.ok()).toBeTruthy()
    const headers = { Origin: origin, 'X-CSRF-Token': (await signed.json()).csrfToken }
    const created = await context.request.post(origin + '/api/admin/award-campaigns', { headers, data: {} })
    const campaign = await created.json()
    expect(
      (
        await context.request.post(origin + '/api/admin/award-campaigns/' + campaign.id + '/transitions', {
          headers,
          data: { phase: 'nomination', version: campaign.version },
        })
      ).ok(),
    ).toBeTruthy()
    expect(
      (
        await context.request.post(origin + '/api/award-campaigns/' + campaign.id + '/nominations', {
          headers,
          data: { title: '登录提醒测试 ' + campaign.id, studio: '', reason: '' },
        })
      ).ok(),
    ).toBeTruthy()
    let state = await (await context.request.get(origin + '/api/award-campaigns/' + campaign.id)).json()
    const nomination = state.nominations[0]
    if (voting) {
      expect(
        (
          await context.request.patch(
            origin + '/api/award-campaigns/' + campaign.id + '/nominations/' + nomination.id,
            {
              headers,
              data: { status: 'approved' },
            },
          )
        ).ok(),
      ).toBeTruthy()
      expect(
        (
          await context.request.post(origin + '/api/admin/award-campaigns/' + campaign.id + '/transitions', {
            headers,
            data: { phase: 'voting', version: state.campaign.version },
          })
        ).ok(),
      ).toBeTruthy()
      state = await (await context.request.get(origin + '/api/award-campaigns/' + campaign.id)).json()
    }
    return { id: campaign.id, candidateId: nomination.candidateId, state }
  } finally {
    await context.close()
  }
}

test('游客浏览不打断，收藏、发帖、书单操作弹出登录提醒；错误密码不循环弹窗', async ({ page }) => {
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: '账号与登录', exact: true })
  await expect(page.locator('.post-card').first()).toBeVisible()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '收藏帖子', exact: true }).first().click()
  await expect(dialog.getByRole('heading', { name: '请先登录', exact: true })).toBeVisible()
  await expect(dialog.locator('.login-required-notice')).toContainText('收藏')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '写点什么', exact: true }).click()
  await expect(dialog.locator('.login-required-notice')).toContainText('发表帖子')
  await page.keyboard.press('Escape')
  await page.goto('/works/1')
  await page.getByRole('button', { name: '登录后记录阅读状态', exact: true }).click()
  await expect(dialog.locator('.login-required-notice')).toContainText('阅读状态')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '登录 / 加入', exact: true }).click()
  await expect(dialog.locator('.login-required-notice')).toHaveCount(0)
  await dialog.getByLabel('用户名或邮箱', { exact: true }).fill(username)
  await dialog.getByLabel('密码', { exact: true }).fill('wrong-password')
  await dialog.getByRole('button', { name: '登录', exact: true }).last().click()
  await expect(dialog.getByRole('alert')).toContainText('密码')
  await expect(dialog.locator('.login-required-notice')).toHaveCount(0)
  expect(await page.locator('.login-modal[open]').count()).toBe(1)
})

test('游客提名先提醒登录，个人提名数量为零', async ({ page, browser }) => {
  const campaign = await campaignFixture(browser, false)
  await page.goto('/awards?campaign=' + campaign.id)
  await expect(page.locator('.award-my-progress')).toContainText('0 /')
  await page.getByRole('button', { name: '提名我喜欢的作品', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录', exact: true })
  await expect(dialog.locator('.login-required-notice')).toContainText('提名')
  await expect(page.locator('.award-nomination-dialog')).not.toBeVisible()
})

test('游客选票登录提醒可关闭，登录前后的选票与推荐词保留，不自动提交', async ({ page, browser }) => {
  const campaign = await campaignFixture(browser, true)
  await page.goto('/awards?campaign=' + campaign.id)
  const ballot = page.locator('.weighted-ballot')
  await ballot.locator('select').first().selectOption(campaign.candidateId)
  const text = ballot.locator('textarea').first()
  await text.fill('登录前写好的推荐词，关闭提醒和登录后都应保留。')
  await ballot.getByRole('button', { name: '提交我的选票', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录', exact: true })
  await expect(dialog.getByRole('heading', { name: '请先登录', exact: true })).toBeVisible()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await dialog.screenshot({ path: test.info().outputPath('login-required-' + width + '.png') })
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBeTruthy()
  }
  await page.keyboard.press('Escape')
  await expect(text).toHaveValue('登录前写好的推荐词，关闭提醒和登录后都应保留。')
  await ballot.getByRole('button', { name: '提交我的选票', exact: true }).click()
  await login(page)
  await expect(text).toHaveValue('登录前写好的推荐词，关闭提醒和登录后都应保留。')
  expect((await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()).myBallot).toBeNull()
  await ballot.getByRole('button', { name: '提交我的选票', exact: true }).click()
  await expect(ballot.getByRole('status')).toContainText('已提交')
})

test('实际会话失效后提交弹窗提醒，重新登录仍保留选票内容', async ({ page, browser }) => {
  const campaign = await campaignFixture(browser, true)
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username, password },
  })
  expect(signed.ok()).toBeTruthy()
  await page.goto('/awards?campaign=' + campaign.id)
  const ballot = page.locator('.weighted-ballot')
  await ballot.locator('select').first().selectOption(campaign.candidateId)
  await ballot.locator('textarea').first().fill('会话失效后保留的推荐词。')
  await page.context().clearCookies()
  await ballot.getByRole('button', { name: '提交我的选票', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '账号与登录', exact: true })
  await expect(dialog.locator('.login-required-notice')).toContainText('过期')
  await login(page)
  await expect(ballot.locator('textarea').first()).toHaveValue('会话失效后保留的推荐词。')
  await ballot.getByRole('button', { name: '提交我的选票', exact: true }).click()
  await expect(ballot.getByRole('status')).toContainText('已提交')
})

test('发帖会话失效时登录窗口位于编辑器上方，同账号恢复后草稿仍在', async ({ page }) => {
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username, password },
  })
  expect(signed.ok()).toBeTruthy()
  await page.goto('/')
  await page.getByRole('button', { name: '写点什么', exact: true }).click()
  const composer = page.getByRole('dialog', { name: '把你的故事，留在这里。', exact: true })
  const title = '恢复登录后的草稿 ' + Date.now().toString(36)
  await composer.getByLabel('帖子标题', { exact: true }).fill(title)
  await composer
    .getByLabel('帖子正文', { exact: true })
    .fill('已经写好的帖子正文不应在登录失效提示出现时被清空。')
  await page.context().clearCookies()
  await composer.getByRole('button', { name: '发布帖子', exact: true }).click()
  await expect(page.locator('.login-required-notice')).toContainText('过期')
  await login(page)
  await expect(composer.getByLabel('帖子标题', { exact: true })).toHaveValue(title)
  await expect(composer.getByLabel('帖子正文', { exact: true })).toHaveValue(
    '已经写好的帖子正文不应在登录失效提示出现时被清空。',
  )
  await composer.getByRole('button', { name: '发布帖子', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
})
