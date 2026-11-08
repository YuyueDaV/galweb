import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Database } from '../src/database'
import { readConfig } from '../src/config'
import { Platform, type Actor } from '../src/platform'
import { Catalog, tierSchema } from '../src/catalog'
import { Bangumi } from '../src/bangumi'
import { TierVoting, tallyTierChoices, tierBallotSchema } from '../src/tier-voting'
import { AccountDeletion } from '../src/account-deletion'
import { hashPassword } from '../src/security'
import { Auth } from '../src/auth'
import { Mailer } from '../src/mail'
import { catalogControllers } from '../src/catalog-api'

const levels = [
  { id: 's', workIds: [1, 2] },
  { id: 'a', workIds: [3] },
]
test('共同 Tier 按每人每部作品一票计数，空选择及失效作品不参与统计', () => {
  const stats = tallyTierChoices(levels, [
    [
      { workId: 1, rowId: 's' },
      { workId: 2, rowId: 'a' },
    ],
    [{ workId: 1, rowId: 'a' }],
    [],
    [{ workId: 99, rowId: 's' }],
  ])
  assert.equal(stats.participants, 2)
  assert.deepEqual(stats.works[0], { workId: 1, total: 2, counts: { s: 1, a: 1 } })
  assert.deepEqual(stats.works[1], { workId: 2, total: 1, counts: { s: 0, a: 1 } })
  assert.equal(stats.works[2]!.total, 0)
})
test('共同 Tier 输入拒绝重复作品、伪造用户和非法分层', () => {
  const body = { version: 0, publicationKey: 'a'.repeat(64), choices: [{ workId: 1, rowId: 's' }] }
  assert.equal(tierBallotSchema.safeParse(body).success, true)
  assert.equal(
    tierBallotSchema.safeParse({ ...body, choices: [...body.choices, ...body.choices] }).success,
    false,
  )
  assert.equal(tierBallotSchema.safeParse({ ...body, userId: randomUUID() }).success, false)
  assert.equal(
    tierBallotSchema.safeParse({ ...body, choices: [{ workId: 1, rowId: '<script>' }] }).success,
    false,
  )
})

test(
  '两种 Tier：个人榜作者隔离与 Bangumi 来源，共同榜改票统计、版本、审核及注销',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db)
    const bangumi = new Bangumi(async (url) =>
      Response.json({
        id: Number(String(url).split('/').at(-1)),
        type: 4,
        name: 'Tier test game',
        name_cn: 'Tier 来源测试',
        summary: '用于隔离测试的作品资料。',
        rating: { score: 8.5, total: 100 },
      }),
    )
    const catalog = new Catalog(db, platform, bangumi),
      voting = new TierVoting(db, platform),
      auth = new Auth(db, config, new Mailer(config))
    const password = 'Isolated tier tests password 123!',
      passwordHash = await hashPassword(password),
      actors: Actor[] = [],
      names: string[] = []
    let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
    try {
      for (const role of ['admin', 'member', 'member']) {
        const id = randomUUID(),
          name = 't_' + id.replaceAll('-', '').slice(0, 15),
          email = id + '@example.com'
        names.push(name)
        await db.execute(
          'INSERT INTO users(id,username,username_key,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [id, name, name, email, email, name, passwordHash, role, Date.now(), Date.now()],
        )
        actors.push({ id, nickname: name, role, status: 'active' })
      }
      const [admin, member, other] = actors as [Actor, Actor, Actor]
      const imported = await catalog.importTierWork(member, 912345),
        workId = imported.work.rank
      assert.equal((await catalog.importTierWork(other, 912345)).work.rank, workId)
      assert.ok(
        !(await catalog.publicWorks()).some((work) => work.rank === workId),
        '个人榜来源不自动加入公共书库',
      )
      const personal = await catalog.createTier(member, '我的个人榜', true)
      const input = tierSchema.parse({
        title: personal.title,
        description: '个人分层',
        rows: [
          { id: 's', label: 'S', color: '#e8b899', workIds: [workId] },
          { id: 'a', label: 'A', color: '#aabbcc', workIds: [] },
        ],
        version: 0,
        action: 'publish',
      })
      await catalog.saveTier(member, personal.id, input, true)
      const detail = await catalog.tierDetail(personal.id)
      assert.equal(detail.mode, 'personal')
      assert.equal(detail.author?.id, member.id)
      assert.ok('works' in detail && detail.works.some((work) => work.rank === workId))
      assert.ok((await catalog.myTiers(other)).items.every((item) => item.id !== personal.id))
      await assert.rejects(() => catalog.saveTier(other, personal.id, { ...input, version: 1 }, true), /作者/)
      await assert.rejects(() => catalog.saveTier(admin, personal.id, { ...input, version: 1 }), /作者/)
      await assert.rejects(() => voting.mine(other, personal.id), /不存在|尚未发布/)
      await catalog.moderatePersonal(admin, personal.id, 1, true)
      await assert.rejects(() => catalog.tierDetail(personal.id), /不存在|尚未发布/)
      await assert.rejects(
        () => catalog.saveTier(member, personal.id, { ...input, version: 2 }, true),
        /下架/,
      )
      await catalog.saveTier(
        member,
        personal.id,
        { ...input, title: '新的私密草稿', version: 2, action: 'save' },
        true,
      )
      await catalog.moderatePersonal(admin, personal.id, 3, false)
      assert.equal((await catalog.tierDetail(personal.id)).title, personal.title)
      const community = await catalog.createTier(admin, '共同投票榜')
      await catalog.saveTier(admin, community.id, { ...input, title: community.title, version: 0 })
      const first = await voting.mine(member, community.id),
        second = await voting.mine(other, community.id)
      await voting.save(member, community.id, { ...first, choices: [{ workId, rowId: 's' }] })
      await voting.save(other, community.id, { ...second, choices: [{ workId, rowId: 'a' }] })
      let stats = await voting.stats(community.id, input.rows)
      assert.equal(stats.participants, 2)
      assert.deepEqual(stats.works[0]!.counts, { s: 1, a: 1 })
      const ballot = await voting.mine(member, community.id)
      const raced = await Promise.allSettled([
        voting.save(member, community.id, { ...ballot, choices: [{ workId, rowId: 'a' }] }),
        voting.save(member, community.id, { ...ballot, choices: [{ workId, rowId: 's' }] }),
      ])
      assert.equal(raced.filter((result) => result.status === 'fulfilled').length, 1)
      stats = await voting.stats(community.id, input.rows)
      assert.equal(stats.works[0]!.total, 2)
      await db.execute("UPDATE users SET status='disabled' WHERE id=?", [member.id])
      assert.equal((await voting.stats(community.id, input.rows)).participants, 1)
      await assert.rejects(() => voting.save(member, community.id, ballot), /不可用/)
      await db.execute("UPDATE users SET status='active' WHERE id=?", [member.id])
      const fresh = await voting.mine(member, community.id)
      await voting.save(member, community.id, { ...fresh, choices: [] })
      assert.equal((await voting.stats(community.id, input.rows)).participants, 1)
      await assert.rejects(
        async () =>
          voting.save(member, community.id, {
            ...(await voting.mine(member, community.id)),
            choices: [{ workId, rowId: 'unknown' }],
          }),
        /不在当前榜单/,
      )
      // Saving a draft must not invalidate the shared ballot's publication key.
      await catalog.saveTier(admin, community.id, { ...input, title: '新草稿', version: 1, action: 'save' })
      assert.equal((await voting.mine(other, community.id)).publicationKey, second.publicationKey)
      // Removing a work prunes its votes; adding it back cannot resurrect old votes.
      await catalog.saveTier(admin, community.id, {
        ...input,
        version: 2,
        rows: [{ ...input.rows[0]!, workIds: [1] }, input.rows[1]!],
      })
      assert.equal((await voting.mine(other, community.id)).choices.length, 0)
      await assert.rejects(() => voting.save(other, community.id, second), /设置已更新/)
      await catalog.saveTier(admin, community.id, { ...input, version: 3 })
      assert.equal((await voting.stats(community.id, input.rows)).participants, 0)
      class TestModule {}
      Module({ controllers: catalogControllers(db, auth, platform, 'tier_test_session', bangumi) })(
        TestModule,
      )
      app = await NestFactory.create(TestModule, { logger: false })
      await app.listen(0, '127.0.0.1')
      const base = await app.getUrl()
      assert.equal((await fetch(base + '/api/tier-lists/' + community.id + '/ballot')).status, 401)
      const session = await auth.login(names[1]!, password, 'tier-test'),
        headers = {
          Cookie: 'tier_test_session=' + session.session,
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
        }
      const current = await voting.mine(member, community.id),
        body = { ...current, choices: [{ workId, rowId: 'a' }] }
      const put = (data: object, csrf = true) =>
        fetch(base + '/api/tier-lists/' + community.id + '/ballot', {
          method: 'PUT',
          headers: csrf ? headers : { Cookie: headers.Cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      assert.equal((await put(body, false)).status, 403)
      assert.equal((await put({ ...body, userId: other.id })).status, 422)
      assert.equal((await put({ ...body, choices: [...body.choices, ...body.choices] })).status, 422)
      assert.equal((await put(body)).status, 200)
      assert.equal((await put(body)).status, 409)
      const publicData = await (await fetch(base + '/api/tier-lists/' + community.id)).json()
      assert.equal(publicData.stats.participants, 1)
      assert.ok(!JSON.stringify(publicData).includes(member.id))
      assert.equal((await fetch(base + '/api/admin/tier-moderation', { headers })).status, 403)
      await new AccountDeletion(db, platform).remove(member, password)
      await assert.rejects(() => catalog.tierDetail(personal.id), /不存在|尚未发布/)
      assert.equal((await voting.stats(community.id, input.rows)).participants, 0)
      assert.equal((await db.rows('SELECT tier_id FROM tier_owners WHERE user_id=?', [member.id])).length, 0)
    } finally {
      await app?.close()
      await db.pool.end()
    }
  },
)
