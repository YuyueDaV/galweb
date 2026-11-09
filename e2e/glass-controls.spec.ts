import { test, expect } from '@playwright/test'

test.use({ hasTouch: true })

test('玻璃下拉：排序、会社搜索、键盘、手机深色面板和原生绑定兼容', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/works')
  const sort = page.getByRole('combobox', { name: '作品排序', exact: true })
  await sort.click()
  const menu = page.getByRole('dialog', { name: '作品排序', exact: true })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('option', { name: '书架顺序', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await menu.getByRole('option', { name: '按 Bangumi 评分', exact: true }).click()
  await expect(menu).not.toBeVisible()
  await expect(page.locator('.glass-select-menu')).toHaveCount(0)
  await expect(sort).toHaveValue('score')
  await expect(sort).toBeFocused()
  await sort.press('Enter')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(sort).toHaveValue('rank')
  await sort.press('Space')
  await page.keyboard.press('Escape')
  await expect(sort).toHaveValue('rank')
  await expect(sort).toBeFocused()
  // Existing native select automation and Vue v-model still work.
  await sort.selectOption('name')
  await sort.click()
  await expect(menu.getByRole('option', { name: '按作品名称', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await menu.screenshot({ path: test.info().outputPath('sort-glass-light-desktop.png') })
  await menu.getByRole('button', { name: '关闭选项', exact: true }).click()

  const company = page.getByRole('combobox', { name: '按会社查找', exact: true })
  await company.click()
  const companies = page.getByRole('dialog', { name: '按会社查找', exact: true })
  await companies.getByLabel('搜索选项', { exact: true }).fill('no matching company here')
  await expect(companies.getByRole('status')).toHaveText('没有匹配的选项')
  await companies.getByLabel('搜索选项', { exact: true }).fill('nitroplus')
  await expect(companies.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(company).toHaveValue('nitroplus')
  await expect(page.locator('.work-card')).toHaveCount(2)

  await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await sort.tap()
  await expect(menu).toBeVisible()
  const box = await menu.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(391)
  expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await expect(menu).toHaveCSS('background-color', /36, 40, 32/)
  await menu.screenshot({ path: test.info().outputPath('sort-glass-dark-mobile.png') })
  await menu.getByRole('option', { name: '书架顺序', exact: true }).click()
  await expect(sort).toHaveValue('managed')
  expect(errors).toEqual([])
})

test('弹窗内下拉保留数字和空值，关闭选择面板不关闭发帖窗口', async ({ page }) => {
  const signed = await page.request.post('/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:3117' },
    data: { username: 'browser_editor', password: 'Isolated editor password 123!' },
  })
  expect(signed.ok()).toBeTruthy()
  await page.goto('/')
  await page.getByRole('button', { name: '写点什么', exact: true }).click()
  const editor = page.locator('.compose-modal[open]')
  const work = editor.getByRole('combobox', { name: '关联作品', exact: true })
  await work.click()
  const menu = page.getByRole('dialog', { name: '关联作品', exact: true })
  await menu.getByLabel('搜索选项').fill('命运石之门')
  const numbered = page.waitForRequest(
    (request) => request.url().endsWith('/api/forum/draft') && request.method() === 'PUT',
  )
  await menu.getByRole('option', { name: '命运石之门', exact: true }).click()
  expect((await numbered).postDataJSON().workId).toBe(1)
  await expect(editor).toBeVisible()
  await expect(work).toHaveValue('1')
  await work.click()
  await menu.getByLabel('搜索选项').fill('不关联作品')
  const cleared = page.waitForRequest(
    (request) => request.url().endsWith('/api/forum/draft') && request.method() === 'PUT',
  )
  await menu.getByRole('option', { name: '不关联作品', exact: true }).click()
  expect((await cleared).postDataJSON().workId).toBeNull()
  await editor.getByRole('combobox', { name: '发布到', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(editor).toBeVisible()
  await expect(page.getByRole('dialog', { name: '发布到', exact: true })).not.toBeVisible()
  await editor.getByRole('button', { name: '关闭发帖窗口', exact: true }).click()
})
