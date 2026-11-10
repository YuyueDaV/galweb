import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Database } from '../src/database'
import { readConfig } from '../src/config'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { qqNominationSchema, qqNominationRevision } from '../src/qq-nominations'
import { nominationDisplayName, nominationDisplayTime } from '../src/award-rules'

test('QQ群同步字段拒绝越权字段、空姓名、无效或未来日期', () => {
  const input = {
    nominatorName: '群内提名人',
    nominatedAt: '2026-11-01T12:30:00+08:00',
    revision: 'a'.repeat(64),
  }
  assert.ok(qqNominationSchema.safeParse(input).success)
  for (const patch of [
    { nominatorName: '' },
    { nominatorName: '昵称\n换行' },
    { nominatedAt: 'not-a-date' },
    { nominatedAt: '2999-01-01T00:00:00Z' },
    { revision: '' },
    { accountId: randomUUID() },
    { createdAt: input.nominatedAt },
    { status: 'approved' },
    { edition: 2 },
  ])
    assert.equal(qqNominationSchema.safeParse({ ...input, ...patch }).success, false)
})

test(
  '第二届管理员更正QQ群姓名日期，原始记录、计分和后续届次不变',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      awards = new Awards(db, new Platform(db))
    try {
      const actors: Actor[] = []
      for (const role of ['admin', 'admin', 'member'] as const) {
        const id = randomUUID(),
          nickname = 'QQ群同步测试' + actors.length
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, id + '@example.com', id + '@example.com', nickname, 'unused', role, Date.now(), Date.now()],
        )
        actors.push({ id, nickname, role, status: 'active' })
      }
      const [admin, other, member] = actors as [Actor, Actor, Actor]
      let second = (await awards.campaigns()).find((campaign) => campaign.edition === 2)!
      assert.equal(second.phase, 'draft')
      await awards.phase(admin, second.id, 'nomination', second.version!)
      await awards.nominate(
        member,
        second.id,
        'QQ群同步测试作品 ' + randomUUID().slice(0, 8),
        '',
        '原始提名说明',
      )
      const original = (await awards.nominations(second.id))[0]!
      const input = qqNominationSchema.parse({
        nominatorName: '群里的羽月',
        nominatedAt: '2026-11-01T12:30:00+08:00',
        revision: qqNominationRevision(original),
      })
      await assert.rejects(() => awards.syncQqNomination(member, second.id, original.id, input), /管理员/)
      await assert.rejects(() => awards.syncQqNomination(admin, second.id, randomUUID(), input), /不属于/)
      await awards.syncQqNomination(admin, second.id, original.id, input)
      const synced = (await awards.nominations(second.id))[0]!
      assert.equal(synced.accountId, original.accountId)
      assert.equal(synced.accountName, original.accountName)
      assert.equal(synced.createdAt, original.createdAt)
      assert.equal(synced.candidateId, original.candidateId)
      assert.equal(synced.status, original.status)
      assert.equal(synced.reason, original.reason)
      assert.equal(nominationDisplayName(synced), '群里的羽月')
      assert.equal(nominationDisplayTime(synced), '2026-11-01T04:30:00.000Z')
      assert.equal((await awards.state(second.id)).nominations[0]!.qqSyncRevision, undefined)
      await assert.rejects(() => awards.syncQqNomination(other, second.id, original.id, input), /已被修改/)
      await assert.rejects(() => awards.nominate(member, second.id, original.title, '', ''), /不能重复/)
      const currentInput = { ...input, revision: qqNominationRevision(synced) }
      const concurrent = await Promise.allSettled([
        awards.syncQqNomination(admin, second.id, original.id, { ...currentInput, nominatorName: '群友甲' }),
        awards.syncQqNomination(other, second.id, original.id, { ...currentInput, nominatorName: '群友乙' }),
      ])
      assert.equal(concurrent.filter((item) => item.status === 'fulfilled').length, 1)
      await awards.nominationAction(admin, second.id, original.id, 'approved')
      second = await awards.campaign(second.id)
      await awards.phase(admin, second.id, 'voting', second.version!)
      await awards.vote(member, second.id, [original.candidateId], 0, {
        loveId: original.candidateId,
        likeIds: [],
        recommendations: [],
      })
      const score = (await awards.state(second.id)).results[0]!.votes
      second = await awards.campaign(second.id)
      await awards.startRunoff(admin, second.id, second.version!)
      let row = (await awards.nominations(second.id))[0]!
      await awards.syncQqNomination(admin, second.id, row.id, {
        ...input,
        nominatorName: '二轮期间校正姓名',
        revision: qqNominationRevision(row),
      })
      assert.equal(
        (await awards.state(second.id)).results[0]!.nominations[0]!.qqSync!.nominatorName,
        '二轮期间校正姓名',
      )
      second = await awards.campaign(second.id)
      await awards.phase(admin, second.id, 'results', second.version!)
      second = await awards.campaign(second.id)
      await awards.phase(admin, second.id, 'archived', second.version!)
      const snapshotBefore = await db.rows('SELECT data FROM award_results WHERE campaign_id=?', [second.id])
      row = (await awards.nominations(second.id))[0]!
      await awards.syncQqNomination(admin, second.id, row.id, {
        ...input,
        nominatorName: '第二届最终QQ提名人',
        revision: qqNominationRevision(row),
      })
      assert.deepEqual(
        await db.rows('SELECT data FROM award_results WHERE campaign_id=?', [second.id]),
        snapshotBefore,
      )
      const historical = await awards.state(second.id)
      assert.equal(historical.results[0]!.votes, score)
      assert.equal(nominationDisplayName(historical.results[0]!.nominations[0]!), '第二届最终QQ提名人')
      const later = await awards.create(admin)
      await awards.phase(admin, later.id, 'nomination', later.version!)
      await awards.nominate(member, later.id, original.title, '', '后续届次正常提名')
      const normal = (await awards.nominations(later.id))[0]!
      await assert.rejects(
        () =>
          awards.syncQqNomination(admin, later.id, normal.id, {
            ...input,
            revision: qqNominationRevision(normal),
          }),
        /仅限第二届/,
      )
      assert.equal(normal.qqSync, undefined)
      assert.equal(nominationDisplayName(normal), member.nickname)
      assert.equal(nominationDisplayTime(normal), normal.createdAt)
      const audit = await awards.state(second.id, admin)
      assert.ok(audit.audit.some((item) => item.action.includes('QQ群提名同步')))
    } finally {
      await db.pool.end()
    }
  },
)
