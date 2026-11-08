import 'reflect-metadata'
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Bangumi } from '../src/bangumi'
import { Catalog, tierSchema, workEditSchema, catalogOrderSchema } from '../src/catalog'
import { catalogControllers } from '../src/catalog-api'
import { Auth } from '../src/auth'
import { Mailer } from '../src/mail'
import { hashPassword } from '../src/security'

test('Tier 校验拒绝重复作品、重复层编号、危险颜色、空榜发布和额外权限字段', () => {
  const base = {
    title: '推荐榜',
    description: '',
    rows: [{ id: 's', label: 'S', color: '#ffbb99', workIds: [1] }],
    version: 0,
    action: 'publish',
  }
  assert.equal(tierSchema.safeParse(base).success, true)
  for (const patch of [
    { rows: [{ ...base.rows[0], workIds: [1, 1] }] },
    { rows: [base.rows[0], base.rows[0]] },
    { rows: [{ ...base.rows[0], color: 'url(javascript:evil)' }] },
    { rows: [{ ...base.rows[0], workIds: [] }] },
    { admin: true },
  ])
    assert.equal(tierSchema.safeParse({ ...base, ...patch }).success, false)
})
test('书库排序输入拒绝重复、非法编号和额外字段', () => {
  const valid = { workIds: [2, 1], previousWorkIds: [1, 2] }
  assert.equal(catalogOrderSchema.safeParse(valid).success, true)
  for (const input of [
    { ...valid, workIds: [1, 1] },
    { ...valid, previousWorkIds: [1, 1] },
    { ...valid, workIds: [0, 2] },
    { ...valid, workIds: [1.5, 2] },
    { ...valid, admin: true },
  ])
    assert.equal(catalogOrderSchema.safeParse(input).success, false)
})

test(
  '书库及 Tier 完整流程：公开搜索、幂等导入、历史关联、权限、版本冲突与草稿发布隔离',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      actors: Actor[] = []
    const password = 'Isolated catalog password 123!'
    const client = new Bangumi(async (url, options) => {
      const id = String(url).includes('/search/') ? 900031 : Number(String(url).split('/').at(-1))
      const item = {
        id,
        type: 4,
        nsfw: new Headers(options?.headers).has('Authorization'),
        name: 'TEST GAME ' + id,
        name_cn: '资料测试作品 ' + id,
        summary: '仅供隔离测试的 Bangumi 返回数据。',
        rating: { score: 8.8, total: 100 },
        images: { large: 'https://lain.bgm.tv/pic/cover/l/test.jpg' },
      }
      return Response.json(String(url).includes('/search/') ? { total: 1, data: [item] } : item)
    }, 'test-only-catalog-token')
    const catalog = new Catalog(db, platform, client)
    const auth = new Auth(db, config, new Mailer(config))
    let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined
    let archive: { data: unknown } | undefined
    try {
      for (const role of ['admin', 'member']) {
        const id = randomUUID(),
          email = id + '@example.com',
          username = 'c_' + id.replaceAll('-', '').slice(0, 15)
        await db.execute(
          'INSERT INTO users(id,email,email_key,username,username_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [
            id,
            email,
            email,
            username,
            username,
            role,
            await hashPassword(password),
            role,
            Date.now(),
            Date.now(),
          ],
        )
        actors.push({ id, nickname: role, role, status: 'active' })
      }
      const [admin, member] = actors as [Actor, Actor]
      await assert.rejects(() => catalog.import(member, 900031), /管理员/)
      const imported = await Promise.all([catalog.import(admin, 900031), catalog.import(admin, 900031)])
      assert.equal(imported[0]!.work.rank, imported[1]!.work.rank)
      const work = imported[0]!.work
      const edited = await catalog.edit(
        admin,
        work.rank,
        workEditSchema.parse({
          title: '管理员整理的作品',
          subtitle: work.subtitle,
          studio: '测试社团',
          description: '管理员精心维护的介绍',
          nominator: '同好会',
          version: work.version,
        }),
      )
      await assert.rejects(
        () => catalog.edit(admin, work.rank, { ...edited, version: work.version }),
        /已被其他管理员修改/,
      )
      const synced = await catalog.import(admin, 900031, edited.rank, edited.version)
      assert.equal(synced.work.description, edited.description)
      archive = (await db.rows<{ data: unknown }>('SELECT data FROM works WHERE id=3'))[0]
      const before = await catalog.detail(3),
        linked = await catalog.import(admin, 900032, 3, before.version)
      assert.equal(linked.work.title, before.title)
      assert.equal(linked.work.archiveRank, 3)
      const list = await catalog.createTier(admin, '隔离测试 Tier 榜')
      const input = tierSchema.parse({
        title: list.title,
        description: '初次发布',
        rows: [{ id: 's', label: 'S', color: '#ffbb99', workIds: [work.rank] }],
        version: 0,
        action: 'save',
      })
      await catalog.saveTier(admin, list.id, input)
      await assert.rejects(() => catalog.tierDetail(list.id), /尚未发布/)
      await assert.rejects(() => catalog.saveTier(member, list.id, { ...input, version: 1 }), /管理员/)
      await catalog.saveTier(admin, list.id, { ...input, version: 1, action: 'publish' })
      await catalog.saveTier(admin, list.id, { ...input, title: '只有管理员能看见的草稿', version: 2 })
      assert.equal((await catalog.tierDetail(list.id)).title, list.title)
      assert.equal((await catalog.tierDetail(list.id, admin)).title, '只有管理员能看见的草稿')
      await assert.rejects(
        () => catalog.saveTier(admin, list.id, { ...input, version: 2 }),
        /已被其他管理员修改/,
      )
      await assert.rejects(
        () =>
          catalog.saveTier(admin, list.id, {
            ...input,
            version: 3,
            rows: [{ ...input.rows[0]!, workIds: [2147483647] }],
          }),
        /不存在/,
      )
      class TestModule {}
      Module({ controllers: catalogControllers(db, auth, platform, 'catalog_test_session', client) })(
        TestModule,
      )
      app = await NestFactory.create(TestModule, { logger: false })
      await app.listen(0, '127.0.0.1')
      const base = await app.getUrl()
      assert.equal((await fetch(base + '/api/bangumi/search?q=CLANNAD')).status, 200)
      assert.equal((await fetch(base + '/api/bangumi/search?q=')).status, 422)
      assert.equal((await fetch(base + '/api/bangumi/search?q=CLANNAD&includeRestricted=true')).status, 401)
      assert.equal((await fetch(base + '/api/bangumi/subjects/13?includeRestricted=true')).status, 401)
      assert.equal((await fetch(base + '/api/admin/works')).status, 401)
      const adminName = (
        await db.rows<{ username: string }>('SELECT username FROM users WHERE id=?', [admin.id])
      )[0]!.username
      const memberName = (
        await db.rows<{ username: string }>('SELECT username FROM users WHERE id=?', [member.id])
      )[0]!.username
      const adminSession = await auth.login(adminName, password, 'catalog-admin'),
        memberSession = await auth.login(memberName, password, 'catalog-member')
      const memberHeaders = { Cookie: 'catalog_test_session=' + memberSession.session }
      const restrictedSearch = await fetch(base + '/api/bangumi/search?q=CLANNAD&includeRestricted=true', {
        headers: memberHeaders,
      })
      assert.equal(restrictedSearch.status, 200)
      assert.equal((await restrictedSearch.json()).items[0].nsfw, true)
      const publicSearch = await fetch(base + '/api/bangumi/search?q=CLANNAD')
      assert.equal((await publicSearch.json()).items[0].nsfw, false)
      const restrictedDetail = await fetch(base + '/api/bangumi/subjects/13?includeRestricted=true', {
        headers: memberHeaders,
      })
      assert.equal(restrictedDetail.status, 200)
      assert.equal((await restrictedDetail.json()).nsfw, true)
      const request = (session: typeof adminSession, path: string, data: object, csrf = true) =>
        fetch(base + path, {
          method: 'PUT',
          headers: {
            Cookie: 'catalog_test_session=' + session.session,
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-Token': session.csrf } : {}),
          },
          body: JSON.stringify(data),
        })
      const beforeOrder = await catalog.publicWorks(),
        ids = beforeOrder.map((work) => work.rank)
      const reverse = { workIds: [...ids].reverse(), previousWorkIds: ids }
      assert.equal(
        (
          await fetch(base + '/api/admin/works/order', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reverse),
          })
        ).status,
        401,
      )
      assert.equal((await request(memberSession, '/api/admin/works/order', reverse)).status, 403)
      assert.equal((await request(adminSession, '/api/admin/works/order', reverse, false)).status, 403)
      assert.equal(
        (await request(adminSession, '/api/admin/works/order', { ...reverse, workIds: ids.slice(1) })).status,
        422,
      )
      assert.equal(
        (
          await request(adminSession, '/api/admin/works/order', {
            ...reverse,
            workIds: [...ids.slice(1), 2147483647],
          })
        ).status,
        422,
      )
      assert.equal(
        (
          await request(adminSession, '/api/admin/works/order', {
            ...reverse,
            workIds: [...ids.slice(1), ids[1]],
          })
        ).status,
        422,
      )
      const responses = await Promise.all([
        request(adminSession, '/api/admin/works/order', reverse),
        request(adminSession, '/api/admin/works/order', {
          workIds: [...ids.slice(1), ids[0]],
          previousWorkIds: ids,
        }),
      ])
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 409],
        '并发旧排序不能互相覆盖',
      )
      const sorted = await catalog.publicWorks()
      assert.notDeepEqual(
        sorted.map((work) => work.rank),
        ids,
      )
      for (const original of beforeOrder) {
        const actual = sorted.find((work) => work.rank === original.rank)!
        const { displayOrder: _position, ...data } = actual
        const { displayOrder: _oldPosition, ...previous } = original
        assert.deepEqual(data, previous, '调整顺序不改变作品编号、档案排名、文案、封面及编辑版本')
      }
      for (const original of beforeOrder) {
        if (original.displayOrder === undefined)
          await db.execute("UPDATE works SET data=JSON_REMOVE(data,'$.displayOrder') WHERE id=?", [
            original.rank,
          ])
        else
          await db.execute("UPDATE works SET data=JSON_SET(data,'$.displayOrder',?) WHERE id=?", [
            original.displayOrder,
            original.rank,
          ])
      }
      assert.deepEqual(
        (await catalog.publicWorks()).map((work) => work.rank),
        ids,
      )
      assert.equal(
        (await request(memberSession, '/api/admin/tier-lists/' + list.id, { ...input, version: 3 })).status,
        403,
      )
      assert.equal(
        (await request(adminSession, '/api/admin/tier-lists/' + list.id, { ...input, version: 3 }, false))
          .status,
        403,
      )
      assert.equal(
        (
          await request(adminSession, '/api/admin/tier-lists/' + list.id, {
            ...input,
            version: 3,
            extra: true,
          })
        ).status,
        422,
      )
      await catalog.saveTier(admin, list.id, { ...input, version: 3, action: 'unpublish' })
      assert.equal((await fetch(base + '/api/tier-lists/' + list.id)).status, 404)
      await db.execute("UPDATE users SET role='member' WHERE id=?", [admin.id])
      await assert.rejects(() => catalog.createTier(admin, '旧会话'), /管理员/)
      await assert.rejects(() => catalog.reorder(admin, reverse), /管理员/)
    } finally {
      await app?.close()
      if (archive)
        await db.execute('UPDATE works SET data=? WHERE id=3', [
          JSON.stringify(typeof archive.data === 'string' ? JSON.parse(archive.data) : archive.data),
        ])
      await db.pool.end()
    }
  },
)
