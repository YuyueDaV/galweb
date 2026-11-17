import { test, expect } from './fixtures'

test('第二届起公布和归档展示全部署名推荐词，第四名及手机布局可读，第一届保持原样', async ({ page }) => {
  const campaign = {
    id: 'award-presentation-fixture',
    edition: 2,
    title: '第二届展示测试',
    phase: 'results',
    nominationLimit: 3,
    voteLimit: 3,
    winnerCount: 4,
    votingRule: 'weighted-v1',
    version: 1,
    nominationStart: null,
    nominationEnd: null,
    votingStart: null,
    votingEnd: null,
    createdAt: new Date().toISOString(),
  }
  const nominations = ['作品甲', '作品乙', '作品丙', 'Rewrite'].map((title, index) => ({
    id: 'nomination-' + index,
    campaignId: campaign.id,
    candidateId: 'candidate-' + index,
    title,
    studio: index === 3 ? 'Key' : '测试会社',
    coverRank: 501 + index,
    reason: '提名阶段的说明',
    accountId: '',
    accountName: '提名人' + index,
    status: 'approved',
    createdAt: campaign.createdAt,
  }))
  const longText = '这是一段完整显示的长推荐词，阅读后留下的感动与思考。'.repeat(22)
  const recommendations = [
    { candidateId: 'candidate-0', text: '第一位作者的推荐词', authorName: '推荐人甲', round: 1 },
    { candidateId: 'candidate-0', text: '第二位作者的推荐词', authorName: '推荐人乙', round: 2 },
    { candidateId: 'candidate-3', text: longText, authorName: 'Rewrite 推荐人', round: 1 },
  ]
  const results = nominations.map((n, index) => ({
    id: n.candidateId,
    title: n.title,
    // Older APIs may return a blank result snapshot despite current nomination metadata.
    studio: index === 3 ? '' : n.studio,
    coverRank: n.coverRank,
    nominations: [n],
    votes: 8 - index,
    rank: index + 1,
  }))
  await page.route('**/api/award-campaigns', (route) => route.fulfill({ json: [campaign] }))
  await page.route('**/api/award-campaigns/' + campaign.id, (route) =>
    route.fulfill({
      json: { campaign, nominations, results, recommendations, ballotCount: 3, myBallot: null, audit: [] },
    }),
  )
  await page.route('**/api/works?view=summary', (route) =>
    route.fulfill({
      json: nominations.map((n) => ({
        rank: n.coverRank,
        title: n.title,
        studio: n.studio,
        subtitle: '',
        description: '书库简介',
        coverUrl: '/images/work-placeholder.svg',
      })),
    }),
  )
  await page.goto('/awards?campaign=' + campaign.id)
  const firstResult = page
    .locator('.award-result-row')
    .filter({ has: page.getByRole('heading', { name: '作品甲', exact: true }) })
  await expect(firstResult.locator('.award-recommendations blockquote')).toHaveCount(2)
  await expect(firstResult).toContainText('推荐人甲')
  await expect(firstResult).toContainText('推荐人乙')
  const fourthResult = page
    .locator('.award-result-row')
    .filter({ has: page.getByRole('heading', { name: 'Rewrite', exact: true }) })
  await expect(fourthResult).toContainText('Key')
  await expect(fourthResult.locator('.award-recommendations')).toContainText(longText)
  await expect(fourthResult.locator('.award-recommendations')).toContainText('Rewrite 推荐人')
  await page.getByRole('button', { name: '实时排名', exact: true }).click()
  const live = page.locator('.live-ranking [data-candidate-id="candidate-3"]')
  await expect(live).toContainText('Key')
  await expect(live.locator('.award-recommendations')).toContainText(longText)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    expect(await fourthResult.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy()
    const text = fourthResult.locator('.award-recommendations blockquote p')
    expect(await text.evaluate((node) => node.scrollHeight <= node.clientHeight + 1)).toBeTruthy()
  }
  await fourthResult.screenshot({ path: test.info().outputPath('published-recommendations-mobile.png') })
  campaign.phase = 'archived'
  await page.reload()
  await expect(
    page.locator('.rank-feature').first().locator('.award-recommendations blockquote'),
  ).toHaveCount(2)
  await expect(page.locator('.rank-feature').first()).toContainText('推荐人乙')
  const archiveRow = page.locator('.rank-row')
  await expect(archiveRow).toContainText('Rewrite')
  await expect(archiveRow).toContainText('Key')
  await expect(archiveRow.locator('.award-recommendations')).toContainText(longText)
  await expect(archiveRow.locator('.award-recommendations')).toContainText('Rewrite 推荐人')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    expect(await archiveRow.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBeTruthy()
  }
  await archiveRow.screenshot({ path: test.info().outputPath('archived-recommendations-mobile.png') })
  await page.goto('/ranking')
  await expect(page.locator('.rank-feature, .rank-row')).toHaveCount(12)
  await expect(page.locator('.award-recommendations')).toHaveCount(0)
})
