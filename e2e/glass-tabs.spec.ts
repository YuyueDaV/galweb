import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'

test('社团页签在浅深色和手机上保持胶囊，图片按钮与个人主页不叠加玻璃灰边', async ({ page }) => {
  const assetId = '3d990fbc-2692-480d-b938-978201d7d004'
  const sharp = createRequire(new URL('../apps/api/package.json', import.meta.url))('sharp')
  const image = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#d97542' } })
    .png()
    .toBuffer()
  await page.route('**/api/assets/' + assetId, (route) =>
    route.fulfill({ contentType: 'image/png', body: image }),
  )
  await page.route('**/api/community-entries?*', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'glass-album',
            date: '2026-11-11',
            kind: 'activity',
            title: '活动相册示例',
            content: '页签与相册显示检查',
            author: '同好会',
            assetIds: [assetId],
          },
        ],
        total: 1,
      },
    }),
  )
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await expect(page.locator('.feed-tabs button').first()).toHaveCSS('box-shadow', 'none')
  await page.getByRole('link', { name: '社团动态与相册', exact: true }).click()
  const tabs = page.getByRole('navigation', { name: '社团档案展示方式' })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
      }, theme)
      for (const button of await tabs.getByRole('button').all()) {
        await expect(button).toHaveCSS('background-image', 'none')
        await expect(button).toHaveCSS('box-shadow', 'none')
        await expect(button).toHaveCSS('backdrop-filter', 'none')
        expect(await button.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
      }
      await tabs.getByRole('button', { name: '活动相册', exact: true }).click()
      await expect(tabs.getByRole('button', { name: '活动相册', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      const photo = page.getByRole('button', { name: '放大活动相册示例 1', exact: true })
      await expect(photo).toHaveCSS('box-shadow', 'none')
      await expect(photo).toHaveCSS('backdrop-filter', 'none')
      await expect(photo.locator('img')).toHaveJSProperty('naturalWidth', 40)
      await photo.click()
      await expect(page.getByRole('dialog', { name: '相册大图' })).toBeVisible()
      await page.getByRole('button', { name: '关闭大图', exact: true }).click()
      const timeline = tabs.getByRole('button', { name: '社团时间线', exact: true })
      await timeline.focus()
      await timeline.press('Enter')
      await expect(timeline).toHaveAttribute('aria-pressed', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
      await tabs.screenshot({ path: test.info().outputPath(`community-tabs-${width}-${theme}.png`) })
    }
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  })
  await expect(tabs).toHaveCSS('backdrop-filter', 'none')
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:3117' },
    data: { username: 'browser_auth', password: 'Isolated moderator password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  await page.goto('/user/' + (await signed.json()).user.id)
  const memberTabs = page.getByRole('navigation', { name: '用户主页内容' })
  await expect(memberTabs.getByRole('button').first()).toHaveCSS('box-shadow', 'none')
  await expect(memberTabs.getByRole('button').first()).toHaveCSS('backdrop-filter', 'none')
  await page.goto('/account')
  await expect(page.locator('.profile-reset')).toHaveCSS('box-shadow', 'none')
  await expect(page.locator('.profile-reset')).toHaveCSS('background-image', 'none')
})

test('十二橙器标题使用计划名额，历史同票的实际数量与待加赛说明保持准确', async ({ page }) => {
  const campaign = {
    id: 'archive-copy-fixture',
    edition: 2,
    title: '第二届十二橙器',
    phase: 'archived',
    winnerCount: 12,
    voteLimit: 3,
    nominationLimit: 3,
    nominationStart: null,
    nominationEnd: null,
    votingStart: null,
    votingEnd: null,
    createdAt: '2026-11-11T00:00:00Z',
    version: 0,
  }
  const results = Array.from({ length: 13 }, (_, i) => ({
    id: 'entry-' + i,
    title: '档案作品 ' + (i + 1),
    studio: '同好会',
    nominations: [],
    rank: Math.min(i + 1, 12),
    votes: Math.max(2, 13 - i),
  }))
  await page.route('**/api/award-campaigns', (route) => route.fulfill({ json: [campaign] }))
  await page.route('**/api/award-campaigns/' + campaign.id, (route) =>
    route.fulfill({
      json: {
        campaign,
        campaigns: [campaign],
        nominations: [],
        myBallot: null,
        ballotVersion: 0,
        results,
        ballotCount: 9,
        recommendations: [],
        audit: [],
      },
    }),
  )
  await page.goto('/awards?campaign=' + campaign.id)
  await expect(page.locator('.ranking-subtitle')).toHaveText('十二部作品，十二种难以忘记的感动。')
  await expect(page.locator('.ranking-intro')).toContainText('13 部共同喜欢的故事')
  await expect(page.locator('.archive-pending-ties')).toBeVisible()
  await page.goto('/ranking')
  await expect(page.locator('.ranking-subtitle')).toHaveText('十二部作品，十二种难以忘记的感动。')
})
