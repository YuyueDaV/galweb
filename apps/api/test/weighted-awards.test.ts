import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { hashPassword } from '../src/security'
import { DEFAULT_BALLOT_RULES } from '../src/award-rules'

test(
  '活动增改删与自定义加权选票：归属、互斥、改票、快照及删除后拒绝操作',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      awards = new Awards(db, new Platform(db))
    try {
      const actors: Actor[] = []
      for (const role of ['admin', 'member'] as const) {
        const id = randomUUID()
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [
            id,
            id + '@example.com',
            id + '@example.com',
            role,
            await hashPassword('weighted test passphrase 123!'),
            role,
            Date.now(),
            Date.now(),
          ],
        )
        actors.push({ id, nickname: role, role, status: 'active' })
      }
      const [admin, member] = actors as [Actor, Actor]
      let c = await awards.create(admin)
      assert.equal(c.votingRule, 'weighted-v1')
      const rules = { ...DEFAULT_BALLOT_RULES, lovePoints: 5, likePoints: 3, recommendationPoints: 4 }
      await awards.settings(admin, c.id, {
        ...c,
        title: '自定义规则测试',
        ballotRules: rules,
        winnerCount: 2,
      })
      c = await awards.campaign(c.id)
      await assert.rejects(
        () => awards.settings(admin, c.id, { ...c, ballotRules: { ...rules, recommendationLimit: 4 } }),
        /推荐词/,
      )
      await awards.phase(admin, c.id, 'nomination', c.version!)
      for (const title of ['加权作品甲', '加权作品乙', '加权作品丙'])
        await awards.nominate(member, c.id, title, '', '')
      const nominations = await awards.nominations(c.id)
      for (const n of nominations) await awards.nominationAction(admin, c.id, n.id, 'approved')
      c = await awards.campaign(c.id)
      await assert.rejects(
        () => awards.settings(admin, c.id, { ...c, ballotRules: { ...rules, lovePoints: 9 } }),
        /锁定/,
      )
      await awards.phase(admin, c.id, 'voting', c.version!)
      const ids = nominations.map((n) => n.candidateId),
        loveId = ids[0]!,
        likeId = ids[1]!,
        unvoted = ids[2]!
      await assert.rejects(() => awards.vote(member, c.id, [loveId], 0), /票/)
      await assert.rejects(
        () => awards.vote(member, c.id, [loveId], 0, { loveId, likeIds: [loveId], recommendations: [] }),
        /一票/,
      )
      await assert.rejects(
        () =>
          awards.vote(member, c.id, [loveId], 0, {
            loveId,
            likeIds: [],
            recommendations: [{ candidateId: unvoted, text: '没有投过' }],
          }),
        /自己投票/,
      )
      await awards.vote(member, c.id, [loveId], 0, { loveId, likeIds: [], recommendations: [] })
      assert.equal((await awards.state(c.id)).myBallot, null)
      await assert.rejects(
        () => awards.vote(member, c.id, [loveId], 0, { loveId, likeIds: [], recommendations: [] }),
        /其他页面/,
      )
      await awards.vote(member, c.id, [loveId, likeId], 1, {
        loveId,
        likeIds: [likeId],
        recommendations: [{ candidateId: loveId, text: '真爱额外推荐' }],
      })
      c = await awards.campaign(c.id)
      await awards.phase(admin, c.id, 'results', c.version!)
      const result = await awards.state(c.id)
      assert.equal(result.results.find((r) => r.id === loveId)!.votes, 9)
      assert.equal(result.results.find((r) => r.id === likeId)!.votes, 3)
      c = await awards.campaign(c.id)
      await awards.settings(admin, c.id, { ...c, title: '公布后修改名称' })
      assert.deepEqual((await awards.state(c.id)).results, result.results)
      c = await awards.campaign(c.id)
      await assert.rejects(() => awards.remove(member, c.id, c.version!, c.title), /管理员/)
      await assert.rejects(() => awards.remove(admin, c.id, c.version! - 1, c.title), /更新/)
      await assert.rejects(() => awards.remove(admin, c.id, c.version!, '错误名称'), /完整活动名称/)
      await awards.remove(admin, c.id, c.version!, c.title)
      assert.ok(!(await awards.campaigns()).some((row) => row.id === c.id))
      await assert.rejects(() => awards.state(c.id), /不存在/)
      await assert.rejects(
        () => awards.vote(member, c.id, [loveId], 2, { loveId, likeIds: [], recommendations: [] }),
        /不存在/,
      )
      assert.equal((await db.rows('SELECT id FROM award_ballots WHERE campaign_id=?', [c.id])).length, 1)
    } finally {
      await db.pool.end()
    }
  },
)
