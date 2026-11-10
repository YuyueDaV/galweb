import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Database } from '../src/database'
import { readConfig } from '../src/config'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { hashPassword } from '../src/security'
import { collectAwardCandidates } from '../src/award-rules'

test(
  '公开提名署名、同人去重、实时匿名计分和保留首轮的二次投票',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      awards = new Awards(db, new Platform(db))
    try {
      const actors: Actor[] = []
      for (const role of ['admin', 'member', 'member'] as const) {
        const id = randomUUID()
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [
            id,
            id + '@example.com',
            id + '@example.com',
            role + actors.length,
            await hashPassword('runoff test passphrase 123!'),
            role,
            Date.now(),
            Date.now(),
          ],
        )
        actors.push({ id, nickname: role + actors.length, role, status: 'active' })
      }
      const [admin, member, other] = actors as [Actor, Actor, Actor]
      let c = await awards.create(admin)
      await awards.settings(admin, c.id, { ...c, winnerCount: 3 })
      c = await awards.campaign(c.id)
      await assert.rejects(() => awards.startRunoff(admin, c.id, c.version!), /首轮/)
      await awards.phase(admin, c.id, 'nomination', c.version!)
      const prefix = randomUUID().slice(0, 8)
      await awards.nominate(member, c.id, prefix + '甲', '', '首位提名人的说明')
      const work = (await awards.nominations(c.id))[0]!
      await assert.rejects(() => awards.nominate(member, c.id, prefix + '甲', '', ''), /不能重复/)
      await awards.nominate(other, c.id, '忽略伪造名称', '', '', { workId: work.coverRank! })
      for (const title of ['乙', '丙']) await awards.nominate(member, c.id, prefix + title, '', '')
      await awards.nominate(other, c.id, prefix + '丁', '', '')
      let publicState = await awards.state(c.id)
      assert.equal(publicState.nominations.length, 5)
      assert.equal(collectAwardCandidates(publicState.nominations, c.id, true).length, 4)
      assert.ok(publicState.nominations.every((n) => n.accountName && !n.accountId))
      assert.equal('ballots' in publicState, false)
      c = await awards.campaign(c.id)
      await assert.rejects(() => awards.phase(admin, c.id, 'voting', c.version!), /待审核/)
      for (const n of await awards.nominations(c.id))
        await awards.nominationAction(admin, c.id, n.id, 'approved')
      await awards.phase(admin, c.id, 'voting', c.version!)
      const candidates = collectAwardCandidates(await awards.nominations(c.id), c.id)
      const a = candidates.find((item) => item.title.endsWith('甲'))!.id
      const b = candidates.find((item) => item.title.endsWith('乙'))!.id
      const cc = candidates.find((item) => item.title.endsWith('丙'))!.id
      await awards.vote(member, c.id, [a], 0, {
        loveId: a,
        likeIds: [],
        recommendations: [{ candidateId: a, text: '公开署名的推荐词' }],
      })
      publicState = await awards.state(c.id)
      const readers = await Promise.all(Array.from({ length: 12 }, () => awards.state(c.id)))
      assert.ok(readers.every((item) => item.results.find((result) => result.id === a)!.votes === 4))
      assert.equal(publicState.results.find((item) => item.id === a)!.votes, 4)
      assert.equal(publicState.results.filter((item) => item.votes === 0).length, 3)
      assert.deepEqual(publicState.recommendations, [
        { candidateId: a, text: '公开署名的推荐词', authorName: member.nickname, round: 1 },
      ])
      assert.equal('rounds' in publicState, false)
      assert.equal('accountId' in publicState.recommendations[0]!, false)
      assert.equal((await awards.state(c.id, admin)).ballots![0]!.accountId, member.id)
      c = await awards.campaign(c.id)
      await assert.rejects(() => awards.phase(admin, c.id, 'results', c.version!), /二次投票/)
      await assert.rejects(() => awards.startRunoff(member, c.id, c.version!), /管理员/)
      const starts = await Promise.allSettled([
        awards.startRunoff(admin, c.id, c.version!),
        awards.startRunoff(admin, c.id, c.version!),
      ])
      assert.equal(starts.filter((item) => item.status === 'fulfilled').length, 1)
      assert.equal(
        (await db.rows('SELECT id FROM notification_broadcasts WHERE event_key=?', [`award:${c.id}:runoff`]))
          .length,
        1,
        '二次投票并发开启只发送一次通知',
      )
      c = await awards.campaign(c.id)
      assert.equal(c.votingRound, 2)
      assert.deepEqual(c.lockedCandidateIds, [a])
      assert.equal(c.votingEnd, null)
      assert.equal((await awards.state(c.id, member)).myBallot, null)
      await assert.rejects(
        () => awards.vote(member, c.id, [b], 0, { loveId: b, likeIds: [], recommendations: [] }),
        /轮次/,
      )
      await assert.rejects(
        () => awards.vote(member, c.id, [a], 0, { loveId: a, likeIds: [], recommendations: [] }, 2),
        /名单/,
      )
      await awards.vote(
        member,
        c.id,
        [b, cc],
        0,
        { loveId: b, likeIds: [cc], recommendations: [{ candidateId: b, text: '第二轮推荐词' }] },
        2,
      )
      const live = await awards.state(c.id)
      assert.equal(live.results.find((item) => item.id === a)!.votes, 4)
      assert.equal(live.results.find((item) => item.id === b)!.votes, 4)
      assert.equal(live.recommendations.length, 2)
      assert.equal(live.ballotCount, 2)
      assert.equal((await awards.state(c.id, admin)).ballots!.length, 2)
      await assert.rejects(() => awards.startRunoff(admin, c.id, c.version!), /首轮/)
      await awards.settings(admin, c.id, {
        ...c,
        title: '修改标题不能篡改轮次',
        votingRound: 1,
        lockedCandidateIds: [],
      })
      c = await awards.campaign(c.id)
      assert.equal(c.votingRound, 2)
      assert.deepEqual(c.lockedCandidateIds, [a])
      await awards.phase(admin, c.id, 'results', c.version!)
      const ended = await awards.state(c.id)
      assert.deepEqual(ended.results, live.results)
      c = await awards.campaign(c.id)
      await awards.phase(admin, c.id, 'archived', c.version!)
      assert.deepEqual((await awards.state(c.id)).results, ended.results)
    } finally {
      await db.pool.end()
    }
  },
)
