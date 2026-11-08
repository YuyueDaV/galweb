import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Catalog, workContributionSchema } from '../src/catalog'
import { Bangumi } from '../src/bangumi'
import { Assets } from '../src/assets'
import { hashPassword } from '../src/security'

test('书库贡献拒绝伪造添加人、审核及角色字段', () => {
  const input = { title: '作品名称', subjectId: null }
  assert.equal(workContributionSchema.safeParse(input).success, true)
  for (const field of [
    'addedById',
    'addedAt',
    'nominator',
    'role',
    'catalogVisible',
    'catalogDeleted',
    'removedAt',
    'displayOrder',
  ])
    assert.equal(workContributionSchema.safeParse({ ...input, [field]: 'forged' }).success, false)
})

test(
  '注册用户贡献书库：手动及 Bangumi 去重、并发提交、封面归属和添加人匿名化',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      assets = new Assets(db, platform),
      marker = randomUUID().slice(0, 8)
    const bangumi = new Bangumi(async (url) => {
      const id = Number(String(url).split('/').at(-1))
      return Response.json({
        id,
        type: 4,
        name: 'GAME ' + marker + ' ' + id,
        name_cn: '作品' + marker + ' ' + id,
        summary: '资料',
        images: { large: 'https://lain.bgm.tv/pic/cover/l/test.jpg' },
      })
    })
    const catalog = new Catalog(db, platform, bangumi)
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
            role,
            await hashPassword('contribution password 123!'),
            role,
            Date.now(),
            Date.now(),
          ],
        )
        actors.push({ id, nickname: role, role, status: 'active' })
      }
      const [admin, member, other] = actors as [Actor, Actor, Actor]
      const image = await assets.create(
        member,
        await sharp({ create: { width: 80, height: 100, channels: 3, background: 'pink' } })
          .png()
          .toBuffer(),
      )
      const input = workContributionSchema.parse({
        title: 'ＭＥＭＢＥＲ！ ' + marker,
        subtitle: 'Alternative ' + marker,
        coverAssetId: image.id,
      })
      const work = await catalog.contribute(member, input)
      assert.equal(work.addedBy?.id, member.id)
      assert.equal(work.coverUrl, image.url)
      assert.equal('addedById' in work, false)
      await assert.rejects(
        () => catalog.contribute(other, workContributionSchema.parse({ title: 'member ' + marker })),
        /已存在/,
      )
      await assert.rejects(
        () => catalog.contribute(other, workContributionSchema.parse({ title: 'ALTERNATIVE ' + marker })),
        /已存在/,
      )
      await assert.rejects(() => catalog.changeCover(other, work.rank, image.id, work.version), /只能修改/)
      await assert.rejects(
        () =>
          catalog.contribute(
            other,
            workContributionSchema.parse({ title: '盗用封面' + marker, coverAssetId: image.id }),
          ),
        /不属于/,
      )
      const calls = await Promise.allSettled([
        catalog.contribute(
          member,
          workContributionSchema.parse({ subjectId: 990101, title: '第一份 ' + marker }),
        ),
        catalog.contribute(
          other,
          workContributionSchema.parse({ subjectId: 990101, title: '不同标题 ' + marker }),
        ),
      ])
      assert.equal(calls.filter((r) => r.status === 'fulfilled').length, 1)
      await assert.rejects(
        () =>
          catalog.contribute(
            member,
            workContributionSchema.parse({ subjectId: 990101, title: '换个名称仍重复 ' + marker }),
          ),
        /已存在/,
      )
      const hidden = await catalog.importTierWork(other, 990102)
      assert.ok(!(await catalog.publicWorks()).some((w) => w.rank === hidden.work.rank))
      const promoted = await catalog.contribute(
        member,
        workContributionSchema.parse({ subjectId: 990102, title: hidden.work.title }),
      )
      assert.equal(promoted.rank, hidden.work.rank)
      assert.equal(promoted.addedBy?.id, member.id)
      const reset = await catalog.changeCover(member, work.rank, null, work.version)
      assert.equal(reset.coverUrl, undefined)
      await assert.rejects(() => catalog.changeCover(member, work.rank, image.id, work.version), /已更新/)
      await catalog.changeCover(member, work.rank, image.id, reset.version)
      await assets.moderate(admin, image.id, 'hidden')
      assert.equal((await catalog.detail(work.rank)).coverUrl, undefined)
      await db.execute('UPDATE users SET nickname=? WHERE id=?', ['新昵称', member.id])
      assert.equal((await catalog.detail(work.rank)).addedBy?.name, '新昵称')
      await db.execute("UPDATE users SET status='deleted',nickname='已注销用户' WHERE id=?", [member.id])
      assert.deepEqual((await catalog.detail(work.rank)).addedBy, { id: null, name: '已注销用户' })
    } finally {
      await db.pool.end()
    }
  },
)
