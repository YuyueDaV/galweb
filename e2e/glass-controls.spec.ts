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
  const scrollY = await page.evaluate(() => window.scrollY)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await expect(companies).toBeVisible()
  expect(await companies.locator('.glass-select-options').evaluate((list) => list.scrollTop)).toBeGreaterThan(
    0,
  )
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
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
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await menu.getByLabel('搜索选项').fill('命运石之门')
  const numbered = page.waitForRequest(
    (request) => request.url().endsWith('/api/forum/draft') && request.method() === 'PUT',
  )
  await menu.getByRole('option', { name: '命运石之门', exact: true }).click()
  expect((await numbered).postDataJSON().workId).toBe(1)
  await expect(editor).toBeVisible()
  await expect(work).toHaveValue('1')
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
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
  const close = editor.getByRole('button', { name: '关闭发帖窗口', exact: true })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const before = await close.boundingBox()
    await editor.locator('.compose-form').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(close).toBeInViewport()
    expect(await close.boundingBox()).toEqual(before)
    expect(before!.width).toBeGreaterThanOrEqual(44)
    expect(before!.height).toBeGreaterThanOrEqual(44)
    await expect(editor.getByRole('button', { name: '保存草稿', exact: true })).toBeInViewport()
    await expect(editor.getByRole('button', { name: '清除草稿', exact: true })).toBeInViewport()
    expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy()
    await editor.screenshot({ path: test.info().outputPath(`compose-controls-${width}.png`) })
    await editor.locator('.compose-form').evaluate((element) => {
      element.scrollTop = 0
    })
  }
  await editor.getByLabel('帖子标题', { exact: true }).fill('草稿按钮操作测试')
  await editor
    .getByLabel('帖子正文', { exact: true })
    .fill('验证调整按钮和滚动区域后草稿仍可正常保存与清除。')
  await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('草稿已保存')
  await editor.getByRole('button', { name: '清除草稿', exact: true }).click()
  await expect(editor.getByRole('status')).toContainText('草稿已清除')
  await expect(editor.getByLabel('帖子标题', { exact: true })).toHaveValue('')
  await expect(editor.getByLabel('帖子正文', { exact: true })).toHaveValue('')
  await editor.getByRole('button', { name: '关闭发帖窗口', exact: true }).click()
})

test('首页筛选控件圆润易点，下拉打开和选择不会拉伸页面或跳动', async ({ page }) => {
  await page.goto('/')
  const sort = page.getByRole('combobox', { name: '帖子排序', exact: true })
  const menu = page.getByRole('dialog', { name: '帖子排序', exact: true })
  const geometry = () =>
    page.evaluate(() => {
      const toolbar = document.querySelector('.feed-toolbar')!.getBoundingClientRect()
      return {
        x: toolbar.x,
        width: toolbar.width,
        height: toolbar.height,
        pageWidth: document.documentElement.clientWidth,
        pageHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
        overflow: getComputedStyle(document.body).overflow,
      }
    })
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.locator('.post-card').first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await sort.scrollIntoViewIfNeeded()
    const before = await geometry()
    if (width < 600) {
      const tabs = await page.locator('.feed-tabs button').evaluateAll((items) =>
        items.map((item) => ({
          width: item.getBoundingClientRect().width,
          y: item.getBoundingClientRect().y,
        })),
      )
      expect(
        Math.max(...tabs.map((item) => item.width)) - Math.min(...tabs.map((item) => item.width)),
      ).toBeLessThan(1)
      expect(new Set(tabs.map((item) => item.y)).size).toBe(1)
      expect((await page.locator('.feed-sort').boundingBox())!.width).toBeCloseTo(before.width, 0)
    }
    const controls = await page
      .locator('.feed-tabs button, .feed-sort, .section-heading .write-link')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          height: element.getBoundingClientRect().height,
          radius: parseFloat(getComputedStyle(element).borderTopLeftRadius),
          font: parseFloat(getComputedStyle(element).fontSize),
        })),
      )
    for (const control of controls) {
      expect(control.height).toBeGreaterThanOrEqual(44)
      expect(control.radius).toBeGreaterThanOrEqual(22)
    }
    await expect(page.locator('.section-heading .write-link')).toHaveCSS('white-space', 'nowrap')
    expect((await page.locator('#feed-title').boundingBox())!.height).toBeLessThan(55)
    for (const button of controls.filter((_, index) => index !== controls.length - 1)) {
      expect(button.font).toBeGreaterThanOrEqual(14)
    }
    expect(
      await sort.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(16)
    await sort.click()
    await expect(menu).toBeVisible()
    expect(await geometry()).toEqual(before)
    await page.keyboard.press('End')
    expect(await geometry()).toEqual(before)
    await page.keyboard.press('Escape')
    expect(await geometry()).toEqual(before)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: test.info().outputPath(`feed-controls-${width}.png`) })
  }
})
