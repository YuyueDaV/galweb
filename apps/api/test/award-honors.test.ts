import test from 'node:test'
import assert from 'node:assert/strict'
import { workAwardHonors, type PublishedAward } from '../src/award-honors'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform } from '../src/platform'
import { Catalog } from '../src/catalog'

const published = (edition: number, phase = 'results', rank = 1, votes = 3): PublishedAward => ({
  campaignId: 'edition-' + edition,
  edition,
  campaign: { phase, winnerCount: 12 },
  results: { results: [{ coverRank: 25, rank, votes }] },
})
test('新作品随正式结果获得届次与排名，多届入选保留历史荣誉', () => {
  assert.deepEqual(workAwardHonors(25, undefined, [published(2), published(3, 'archived', 5)]), [
    { campaignId: 'edition-3', edition: 3, rank: 5 },
    { campaignId: 'edition-2', edition: 2, rank: 1 },
  ])
  assert.equal(workAwardHonors(25, undefined, [published(2, 'voting')]).length, 0)
  assert.equal(workAwardHonors(25, undefined, [published(2, 'results', 13)]).length, 0)
  assert.equal(workAwardHonors(25, undefined, [published(2, 'results', 1, 0)]).length, 0)
  assert.equal(workAwardHonors(99, undefined, [published(2)]).length, 0)
  const deleted = published(2)
  deleted.campaign = { phase: 'results', winnerCount: 12, deletedAt: '2026-11-10' }
  assert.equal(workAwardHonors(25, undefined, [deleted]).length, 0)
})
test('第一届档案保留，作品使用稳定书库编号匹配，并支持提名里的作品引用', () => {
  const row = published(2)
  row.results = JSON.stringify({ results: [{ rank: 2, votes: 4, nominations: [{ coverRank: 3 }] }] })
  assert.deepEqual(workAwardHonors(3, 3, [row]), [
    { campaignId: 'edition-2', edition: 2, rank: 2 },
    { campaignId: 'orange-awards-1', edition: 1, rank: 3 },
  ])
})

test(
  '书库列表和详情仅在结果公布后更新荣誉，删除活动后移除对应标记',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const c = readConfig()
    assert.match(c.DB_NAME, /_test$/)
    const db = new Database(c),
      catalog = new Catalog(db, new Platform(db)),
      id = randomUUID()
    try {
      const [next] = await db.rows<{ edition: number }>(
        'SELECT COALESCE(MAX(edition),0)+1 AS edition FROM award_campaigns',
      )
      const edition = Number(next!.edition),
        campaign = { id, edition, phase: 'voting', winnerCount: 12 }
      await db.execute('INSERT INTO award_campaigns(id,edition,data) VALUES (?,?,?)', [
        id,
        edition,
        JSON.stringify(campaign),
      ])
      await db.execute('INSERT INTO award_results(campaign_id,data) VALUES (?,?)', [
        id,
        JSON.stringify({ results: [{ coverRank: 3, rank: 2, votes: 5 }] }),
      ])
      assert.ok(!(await catalog.detail(3)).awardHonors.some((h) => h.campaignId === id))
      await db.execute('UPDATE award_campaigns SET data=? WHERE id=?', [
        JSON.stringify({ ...campaign, phase: 'results' }),
        id,
      ])
      assert.ok(
        (await catalog.detail(3)).awardHonors.some(
          (h) => h.campaignId === id && h.edition === edition && h.rank === 2,
        ),
      )
      assert.ok(
        (await catalog.publicWorks()).find((w) => w.rank === 3)!.awardHonors.some((h) => h.campaignId === id),
      )
      await db.execute('UPDATE award_campaigns SET data=? WHERE id=?', [
        JSON.stringify({ ...campaign, phase: 'archived', deletedAt: new Date().toISOString() }),
        id,
      ])
      assert.ok(!(await catalog.detail(3)).awardHonors.some((h) => h.campaignId === id))
    } finally {
      await db.execute('DELETE FROM award_results WHERE campaign_id=?', [id])
      await db.execute('DELETE FROM award_campaigns WHERE id=?', [id])
      await db.pool.end()
    }
  },
)
