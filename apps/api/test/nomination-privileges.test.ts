import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { Catalog, workContributionSchema } from '../src/catalog'
import { Bangumi } from '../src/bangumi'
import {
  collectAwardCandidates,
  nominationDisplayName,
  nominationDisplayTime,
  nominationDisplayReason,
} from '../src/award-rules'
import { nominationDetailsSchema, nominationDetailsRevision } from '../src/nomination-details'

async function fixture(
  run: (data: {
    db: Database
    awards: Awards
    catalog: Catalog
    owner: Actor
    admin: Actor
    member: Actor
    marker: string
  }) => Promise<void>,
) {
  const config = readConfig()
  assert.match(config.DB_NAME, /_test$/)
  const db = new Database(config),
    platform = new Platform(db),
    marker = randomUUID()
  const bangumi = new Bangumi(async (url) => {
    const id = Number(String(url).split('/').at(-1))
    return Response.json({
      id,
      type: 4,
      name: 'GAME ' + marker + ' ' + id,
      name_cn: '会社测试 ' + marker + ' ' + id,
      summary: '来自 Bangumi 的原始介绍',
      infobox: [{ key: '开发', value: 'Bangumi 原始会社' }],
    })
  })
  const catalog = new Catalog(db, platform, bangumi),
    awards = new Awards(db, platform, catalog)
  try {
    const actors: Actor[] = []
    for (const role of ['super_admin', 'admin', 'member'] as const) {
      const id = randomUUID()
      await db.execute(
        'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [id, id + '@example.com', id + '@example.com', role, 'unused', role, Date.now(), Date.now()],
      )
      actors.push({ id, nickname: role, role, status: 'active' })
    }
    await run({ db, awards, catalog, owner: actors[0]!, admin: actors[1]!, member: actors[2]!, marker })
  } finally {
    await db.pool.end()
  }
}

test(
  '仅实时超级管理员可超额或重复提名，仍独立审核、合并候选且遵守活动阶段',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    await fixture(async ({ db, awards, catalog, owner, admin, member, marker }) => {
      const c = await awards.create(admin)
      await awards.settings(admin, c.id, { ...c, nominationLimit: 1 })
      await awards.phase(admin, c.id, 'nomination', (await awards.campaign(c.id)).version!)
      const title = '重复补录 ' + marker
      await Promise.all(
        [1, 2, 3].map((i) => awards.nominate(owner, c.id, title, '补录会社', '第 ' + i + ' 条说明')),
      )
      await awards.nominate(owner, c.id, '额外作品 ' + marker, '', '')
      let nominations = await awards.nominations(c.id)
      const repeated = nominations.filter((n) => n.title === title)
      assert.equal(repeated.length, 3)
      assert.equal(new Set(repeated.map((n) => n.id)).size, 3)
      assert.equal(new Set(repeated.map((n) => n.candidateId)).size, 1)
      assert.ok(repeated.every((n) => n.status === 'pending'))
      assert.equal((await catalog.works()).filter((w) => w.title === title).length, 1)
      assert.equal(collectAwardCandidates(nominations, c.id, true).length, 2)
      await awards.nominate(member, c.id, title, '', '')
      await awards.nominate(admin, c.id, title, '', '')
      for (const actor of [member, admin, { ...member, role: 'super_admin' as const }])
        await assert.rejects(() => awards.nominate(actor, c.id, '超额失败 ' + marker, '', ''), /提名上限/)
      assert.ok(!(await catalog.works()).some((w) => w.title === '超额失败 ' + marker))
      await db.execute("UPDATE users SET role='admin' WHERE id=?", [owner.id])
      await assert.rejects(
        () => awards.nominate(owner, c.id, title, '', ''),
        /提名上限/,
        '降级后旧 Actor 不能保留例外',
      )
      await db.execute("UPDATE users SET role='super_admin' WHERE id=?", [owner.id])
      const second = await awards.create(admin)
      await awards.phase(admin, second.id, 'nomination', second.version!)
      for (const actor of [admin, member]) {
        await awards.nominate(actor, second.id, title, '', '')
        await assert.rejects(() => awards.nominate(actor, second.id, title, '', ''), /不能重复提交/)
      }
      nominations = await awards.nominations(c.id)
      for (const nomination of nominations)
        await awards.nominationAction(admin, c.id, nomination.id, 'approved')
      await awards.phase(admin, c.id, 'voting', (await awards.campaign(c.id)).version!)
      await assert.rejects(() => awards.nominate(owner, c.id, title, '', ''), /阶段/)
    })
  },
)

test(
  '跨届批量编辑多位提名人、日期和提名词，原始记录与分数保留，并发或越权整批回滚',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    await fixture(async ({ awards, db, admin, member, marker }) => {
      const campaign = await awards.create(admin)
      await awards.settings(admin, campaign.id, { ...campaign, winnerCount: 1 })
      await awards.phase(admin, campaign.id, 'nomination', (await awards.campaign(campaign.id)).version!)
      const title = '多位提名人 ' + marker
      for (const actor of [admin, member])
        await awards.nominate(actor, campaign.id, title, '', '原始说明 ' + actor.nickname)
      const original = await awards.nominations(campaign.id)
      const entries = original.map((n, i) => ({
        id: n.id,
        revision: nominationDetailsRevision(n),
        nominatorName: '补录提名人 ' + i,
        nominatedAt: '2026-11-01T12:30:00+08:00',
        reason: i ? '' : '独立提名词'.repeat(100),
      }))
      const input = nominationDetailsSchema.parse({ entries })
      await assert.rejects(() => awards.editNominationDetails(member, campaign.id, input), /管理员/)
      await assert.rejects(
        () =>
          awards.editNominationDetails(admin, campaign.id, {
            entries: [entries[0]!, { ...entries[1]!, id: randomUUID() }],
          }),
        /不属于/,
      )
      assert.deepEqual(await awards.nominations(campaign.id), original)
      await awards.editNominationDetails(admin, campaign.id, input)
      const saved = await awards.nominations(campaign.id)
      saved.forEach((n, i) => {
        assert.deepEqual({ ...n, displayOverride: undefined }, { ...original[i], displayOverride: undefined })
        assert.equal(nominationDisplayName(n), entries[i]!.nominatorName)
        assert.equal(nominationDisplayTime(n), '2026-11-01T04:30:00.000Z')
        assert.equal(nominationDisplayReason(n), entries[i]!.reason)
      })
      const state = await awards.state(campaign.id, admin)
      assert.ok(state.nominations.every((n) => n.detailsRevision))
      assert.ok((await awards.state(campaign.id, member)).nominations.every((n) => !n.detailsRevision))
      const currentEntries = saved.map((n) => ({
        id: n.id,
        revision: nominationDetailsRevision(n),
        nominatorName: nominationDisplayName(n),
        nominatedAt: nominationDisplayTime(n),
        reason: '整批修改',
      }))
      await assert.rejects(
        () =>
          awards.editNominationDetails(admin, campaign.id, { entries: [currentEntries[0]!, entries[1]!] }),
        /已被修改/,
      )
      assert.deepEqual(await awards.nominations(campaign.id), saved)
      const races = await Promise.allSettled([
        awards.editNominationDetails(admin, campaign.id, { entries: currentEntries }),
        awards.editNominationDetails(admin, campaign.id, {
          entries: currentEntries.map((n) => ({ ...n, reason: '并发修改' })),
        }),
      ])
      assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1)
      for (const n of saved) await awards.nominationAction(admin, campaign.id, n.id, 'approved')
      await awards.phase(admin, campaign.id, 'voting', (await awards.campaign(campaign.id)).version!)
      await awards.vote(member, campaign.id, [saved[0]!.candidateId], 0, {
        loveId: saved[0]!.candidateId,
        likeIds: [],
        recommendations: [],
      })
      await awards.phase(admin, campaign.id, 'results', (await awards.campaign(campaign.id)).version!)
      await awards.phase(admin, campaign.id, 'archived', (await awards.campaign(campaign.id)).version!)
      const before = await db.rows('SELECT data FROM award_results WHERE campaign_id=?', [campaign.id])
      const historical = await awards.state(campaign.id)
      const latest = await awards.nominations(campaign.id)
      await awards.editNominationDetails(admin, campaign.id, {
        entries: latest.map((n) => ({
          id: n.id,
          revision: nominationDetailsRevision(n),
          nominatorName: '归档后校正 ' + n.accountName,
          nominatedAt: n.createdAt,
          reason: '归档后提名词',
        })),
      })
      const after = await awards.state(campaign.id)
      assert.deepEqual(
        await db.rows('SELECT data FROM award_results WHERE campaign_id=?', [campaign.id]),
        before,
      )
      assert.equal(after.results[0]!.votes, historical.results[0]!.votes)
      assert.equal(after.results[0]!.rank, historical.results[0]!.rank)
      assert.ok(after.results[0]!.nominations.every((n) => nominationDisplayReason(n) === '归档后提名词'))
      const later = await awards.create(admin)
      await assert.rejects(
        () => awards.editNominationDetails(admin, later.id, { entries: currentEntries }),
        /不属于/,
      )
      assert.ok((await awards.state(campaign.id, admin)).audit.some((a) => a.action.includes('编辑提名展示')))
    })
  },
)

test('批量提名编辑拒绝空批次、重复编号、越权字段和非法输入', () => {
  const entry = {
    id: randomUUID(),
    nominatorName: '群友',
    nominatedAt: '2026-11-01T00:00:00Z',
    reason: '',
    revision: 'a'.repeat(64),
  }
  assert.ok(nominationDetailsSchema.safeParse({ entries: [entry] }).success)
  for (const patch of [
    { nominatorName: '' },
    { nominatorName: '换\n行' },
    { reason: '字'.repeat(601) },
    { nominatedAt: '2999-01-01T00:00:00Z' },
    { revision: '' },
    { accountId: randomUUID() },
    { status: 'approved' },
  ])
    assert.equal(nominationDetailsSchema.safeParse({ entries: [{ ...entry, ...patch }] }).success, false)
  assert.equal(nominationDetailsSchema.safeParse({ entries: [] }).success, false)
  assert.equal(nominationDetailsSchema.safeParse({ entries: [entry, entry] }).success, false)
})

test(
  'Bangumi 新作品优先保存自填会社，已有资料保护、空白补全和失败回滚',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    await fixture(async ({ awards, catalog, admin, member, marker }) => {
      const c = await awards.create(admin)
      await awards.phase(admin, c.id, 'nomination', c.version!)
      await awards.nominate(member, c.id, '不采信的客户端标题', '  自填会社  ', '', { subjectId: 998301 })
      const imported = (await catalog.publicWorks()).find((w) => w.bangumi?.id === 998301)!
      assert.equal(imported.studio, '自填会社')
      assert.equal(imported.bangumi?.studio, 'Bangumi 原始会社')
      assert.equal((await awards.nominations(c.id))[0]!.studio, '自填会社')
      await awards.nominate(member, c.id, '另一作品', '', '', { subjectId: 998302 })
      assert.equal(
        (await catalog.publicWorks()).find((w) => w.bangumi?.id === 998302)?.studio,
        'Bangumi 原始会社',
      )
      const blank = await catalog.contribute(
        admin,
        workContributionSchema.parse({ title: '空白会社 ' + marker }),
      )
      await awards.nominate(member, c.id, blank.title, '补全后的会社', '', { workId: blank.rank })
      const filled = await catalog.detail(blank.rank)
      assert.equal(filled.studio, '补全后的会社')
      assert.equal(filled.version, blank.version + 1)
      assert.deepEqual(filled.addedBy, blank.addedBy)
      await awards.nominate(admin, c.id, '不得覆盖已收录资料', '覆盖尝试', '', { subjectId: 998301 })
      assert.equal((await catalog.detail(imported.rank)).studio, '自填会社')
      const rollback = await catalog.contribute(
        admin,
        workContributionSchema.parse({ title: '失败不补全 ' + marker }),
      )
      await assert.rejects(
        () => awards.nominate(member, c.id, rollback.title, '不能保存', '', { workId: rollback.rank }),
        /提名上限/,
      )
      assert.equal((await catalog.detail(rollback.rank)).studio, '')
      assert.equal((await catalog.detail(rollback.rank)).version, rollback.version)
      const hidden = await catalog.importTierWork(admin, 998303)
      await awards.nominate(admin, c.id, '从隐藏条目加入', '手动完善会社', '', { subjectId: 998303 })
      const published = await catalog.detail(hidden.work.rank)
      assert.equal(published.studio, '手动完善会社')
      assert.equal(published.rank, hidden.work.rank)
    })
  },
)
