import { test, expect } from '@playwright/test'

test('作品书架每页 24 部，筛选排序重置页码，两种视图共用分页', async ({ page }) => {
  const works = Array.from({ length: 49 }, (_, index) => ({
    rank: 2001 + index,
    title: `分页测试作品 ${String(index + 1).padStart(2, '0')}`,
    subtitle: '',
    studio: index < 25 ? '分页会社甲' : '分页会社乙',
    description: '分页书架测试作品',
    nominator: '测试成员',
    color: '#d6a44d',
    coverUrl: '/images/work-placeholder.svg',
  }))
  await page.route('**/api/works?view=summary', (route) => route.fulfill({ json: works }))
  await page.goto('/ranking')
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: '作品书架', exact: true })
    .click()
  const pagination = page.getByRole('navigation', { name: '作品书架分页' })
  const previous = pagination.getByRole('button', { name: '上一页', exact: true })
  const next = pagination.getByRole('button', { name: '下一页', exact: true })
  await expect(page.locator('.work-card')).toHaveCount(24)
  await expect(page.locator('.work-card').first()).toContainText('分页测试作品 01')
  await expect(page.locator('.work-card').last()).toContainText('分页测试作品 24')
  await expect(previous).toBeDisabled()
  await expect(pagination).toContainText('第 1 / 3 页')
  await next.click()
  await expect(page.locator('.work-card')).toHaveCount(24)
  await expect(page.locator('.work-card').first()).toContainText('分页测试作品 25')
  await expect(page.locator('.work-card').last()).toContainText('分页测试作品 48')
  await page.getByRole('button', { name: '立体书架', exact: true }).click()
  await expect(page.locator('.shelf-book')).toHaveCount(24)
  await expect(page.locator('.shelf-book').first()).toContainText('分页测试作品 25')
  await next.click()
  await expect(page.locator('.shelf-book')).toHaveCount(1)
  await expect(page.locator('.shelf-book').first()).toContainText('分页测试作品 49')
  await expect(next).toBeDisabled()
  await expect(page.locator('.library-page-summary')).toContainText('49–49 部，共 49 部')
  await previous.click()
  await expect(page.locator('.shelf-book')).toHaveCount(24)
  await page.getByLabel('搜索作品', { exact: true }).fill('作品 49')
  await expect(page.locator('.shelf-book')).toHaveCount(1)
  await expect(pagination).toHaveCount(0)
  await expect(page.locator('.library-page-summary')).toContainText('1–1 部，共 1 部')
  await page.getByLabel('搜索作品', { exact: true }).fill('不存在的作品')
  await expect(page.locator('.shelf-book')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '书架上还没有找到这部作品' })).toBeVisible()
  await page.getByRole('button', { name: '查看全部作品', exact: true }).click()
  await next.click()
  await page.getByLabel('按会社查找').selectOption('分页会社甲')
  await expect(pagination).toContainText('第 1 / 2 页')
  await expect(page.locator('.shelf-book')).toHaveCount(24)
  await next.click()
  await expect(page.locator('.shelf-book')).toHaveCount(1)
  await expect(page.locator('.shelf-book').first()).toContainText('分页测试作品 25')
  await page.getByLabel('作品排序').selectOption('name')
  await expect(pagination).toContainText('第 1 / 2 页')
  await page.getByRole('button', { name: '卡片列表', exact: true }).click()
  await expect(page.locator('.work-card')).toHaveCount(24)
  await page.setViewportSize({ width: 390, height: 844 })
  await pagination.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await pagination.screenshot({ path: test.info().outputPath('work-pagination-mobile.png') })
})
