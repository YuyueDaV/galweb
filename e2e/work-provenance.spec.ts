import { test, expect } from '@playwright/test'

test('提交前普通管理员编辑，提交后只读；超管核对来源、编辑成员作品并合并书库关联', async ({
  page,
  browser,
}) => {
  const origin = 'http://127.0.0.1:3117'
  const login = async (
    request: typeof page.request,
    username: string,
    password = 'Isolated moderator password 123!',
  ) => {
    const response = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username, password },
    })
    expect(response.ok()).toBeTruthy()
    return { Origin: origin, 'X-CSRF-Token': (await response.json()).csrfToken }
  }
  const headers = await login(page.request, 'browser_owner_other')
  const member = await browser.newContext({ baseURL: origin }),
    admin = await browser.newContext({ baseURL: origin })
  try {
    const memberHeaders = await login(member.request, 'browser_member')
    const adminHeaders = await login(
      admin.request,
      'browser_background_editor',
      'Isolated editor password 123!',
    )
    const title = '成员来源作品 ' + Date.now(),
      canonicalTitle = title + '正式条目'
    const contribute = async (name: string) => {
      const response = await member.request.post('/api/works', {
        headers: memberHeaders,
        data: { title: name, studio: '成员会社' },
      })
      expect(response.ok()).toBeTruthy()
      return response.json()
    }
    const a = await contribute(title),
      b = await contribute(canonicalTitle)
    const campaign = await (
      await page.request.post('/api/admin/award-campaigns', { headers, data: {} })
    ).json()
    expect(
      (
        await page.request.post('/api/admin/award-campaigns/' + campaign.id + '/transitions', {
          headers,
          data: { phase: 'nomination', version: campaign.version },
        })
      ).ok(),
    ).toBeTruthy()
    const manager = await admin.newPage()
    await manager.goto('/admin/works')
    await manager.getByRole('button', { name: title, exact: true }).click()
    const panel = manager.locator('.settings-form')
    await expect(panel.getByLabel('作品名称', { exact: true })).toBeEditable()
    await panel.getByLabel('制作组', { exact: true }).fill('旧页面未保存会社')
    const endpoint = '/api/award-campaigns/' + campaign.id + '/nominations'
    const nominate = async (work: { rank: number; title: string }, reason: string) => {
      const response = await member.request.post(endpoint, {
        headers: memberHeaders,
        data: { title: work.title, studio: '', reason, workId: work.rank },
      })
      expect(response.ok()).toBeTruthy()
      return response.json()
    }
    await nominate(a, '原始提名甲')
    await panel.getByRole('button', { name: '保存作品资料', exact: true }).click()
    await expect(manager.getByRole('alert')).toContainText('仅限超级管理员')
    await manager.reload()
    await manager.getByRole('button', { name: title, exact: true }).click()
    await expect(panel).toContainText('已提交提名')
    await expect(panel.getByLabel('作品名称', { exact: true })).toBeDisabled()
    await expect(panel.getByRole('button', { name: '删除书库作品', exact: true })).toBeDisabled()
    await manager.getByRole('button', { name: canonicalTitle, exact: true }).click()
    await expect(panel.getByLabel('作品名称', { exact: true })).toBeEditable()
    await panel.getByLabel('制作组', { exact: true }).fill('提交前管理员会社')
    await panel.getByRole('button', { name: '保存作品资料', exact: true }).click()
    await expect(manager.getByText('作品资料已保存，书架与详情页已更新。', { exact: true })).toBeVisible()
    await nominate(b, '原始提名乙')
    const before = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
    const initial = before.nominations.find((n: { coverRank: number }) => n.coverRank === a.rank)
    const count = (await (await page.request.get('/api/works')).json()).length
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/awards?campaign=' + campaign.id)
    await page
      .locator('.award-candidate-card')
      .filter({ hasText: title })
      .filter({ hasNotText: canonicalTitle })
      .getByRole('button', { name: '编辑作品', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑作品资料', exact: true })
    await expect(editor).toContainText('书库 #' + a.rank)
    await expect(editor).toContainText('收录人：browser_member')
    await editor.getByText('查看原提交来源（1 条）', { exact: true }).click()
    await expect(editor).toContainText('从书库选择 · 原关联书库 #' + a.rank)
    await editor.getByRole('combobox', { name: '关联已有书库作品', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '关联已有书库作品', exact: true })
    await picker.getByLabel('搜索选项').fill(canonicalTitle)
    await picker.getByRole('option', { name: canonicalTitle + ' · 书库 #' + b.rank, exact: true }).click()
    await editor.getByRole('checkbox').check()
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy()
    }
    await editor.evaluate((el) => {
      el.scrollTop = 0
    })
    await editor.screenshot({ path: test.info().outputPath('candidate-source-desktop.png') })
    await editor.getByRole('button', { name: '保存书库关联', exact: true }).click()
    await expect(editor).not.toBeVisible()
    await expect(page.locator('.award-candidate-card')).toHaveCount(1)
    const merged = await (await page.request.get('/api/award-campaigns/' + campaign.id)).json()
    expect(merged.nominations).toHaveLength(2)
    expect(new Set(merged.nominations.map((n: { candidateId: string }) => n.candidateId)).size).toBe(1)
    expect(merged.nominations.every((n: { coverRank: number }) => n.coverRank === b.rank)).toBeTruthy()
    expect(merged.nominations.find((n: { id: string }) => n.id === initial.id).workSource.workId).toBe(a.rank)
    expect((await (await page.request.get('/api/works')).json()).length).toBe(count)
    await page.getByRole('button', { name: '编辑作品', exact: true }).click()
    await editor.getByLabel('制作组／会社', { exact: true }).fill('超管维护成员作品')
    await editor.getByRole('button', { name: '保存作品资料', exact: true }).click()
    await expect(editor).not.toBeVisible()
    expect((await (await page.request.get('/api/works/' + b.rank)).json()).studio).toBe('超管维护成员作品')
    const candidate = merged.nominations[0].candidateId
    expect(
      (
        await admin.request.get('/api/admin/award-campaigns/' + campaign.id + '/candidates/' + candidate)
      ).status(),
    ).toBe(403)
    expect(
      (
        await admin.request.patch(
          '/api/admin/award-campaigns/' + campaign.id + '/candidates/' + candidate + '/work',
          {
            headers: adminHeaders,
            data: { currentWorkId: b.rank, currentVersion: 2, workId: a.rank, version: 1 },
          },
        )
      ).status(),
    ).toBe(403)
    await manager.goto('/awards?campaign=' + campaign.id)
    await expect(manager.getByRole('button', { name: '编辑作品', exact: true })).toHaveCount(0)
  } finally {
    await member.close()
    await admin.close()
  }
})
