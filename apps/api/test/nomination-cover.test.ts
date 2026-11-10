import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Database } from '../src/database'
import { readConfig } from '../src/config'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { Catalog } from '../src/catalog'
import { hashPassword } from '../src/security'

test(
  '手动提名封面：归属校验、书库复用保护、配额失败回滚和持久化',
  {
    skip: process.env.AUTH_INTEGRATION !== '1',
  },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db)
    const catalog = new Catalog(db, platform),
      awards = new Awards(db, platform, catalog)
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
            await hashPassword('cover test passphrase 123!'),
            role,
            Date.now(),
            Date.now(),
          ],
        )
        actors.push({ id, nickname: role, role, status: 'active' })
      }
      const [admin, member, other] = actors as [Actor, Actor, Actor]
      const ownCover = randomUUID(),
        otherCover = randomUUID(),
        hiddenCover = randomUUID()
      for (const [id, user, status] of [
        [ownCover, member.id, 'active'],
        [otherCover, other.id, 'active'],
        [hiddenCover, member.id, 'hidden'],
      ])
        await db.execute(
          'INSERT INTO assets(id,user_id,width,height,bytes,status,created_at) VALUES (?,?,100,150,100,?,?)',
          [id, user, status, Date.now()],
        )
      const c = await awards.create(admin)
      await awards.settings(admin, c.id, { ...c, nominationLimit: 1 })
      await awards.phase(admin, c.id, 'nomination', (await awards.campaign(c.id)).version!)
      const prefix = randomUUID()
      for (const [i, coverAssetId] of [otherCover, hiddenCover, randomUUID()].entries()) {
        const title = prefix + '-invalid-' + i
        await assert.rejects(
          () => awards.nominate(member, c.id, title, '', '', { coverAssetId }),
          /不可用或不属于/,
        )
        assert.ok(!(await catalog.works()).some((work) => work.title === title))
      }
      await assert.rejects(
        () => awards.nominate(member, c.id, prefix, '', '', { coverAssetId: ownCover, workId: 1 }),
        /仅用于手动/,
      )
      await assert.rejects(
        () => awards.nominate(member, c.id, prefix, '', '', { coverAssetId: ownCover, subjectId: 1 }),
        /仅用于手动/,
      )
      await awards.nominate(member, c.id, prefix, '测试会社', '', { coverAssetId: ownCover })
      const work = (await catalog.publicWorks()).find((work) => work.title === prefix)!
      assert.equal(work.coverUrl, '/api/assets/' + ownCover)
      assert.equal(work.addedBy?.id, member.id)
      assert.equal((await awards.nominations(c.id))[0]!.coverRank, work.rank)
      await assert.rejects(
        () => awards.nominate(other, c.id, prefix, '', '', { coverAssetId: otherCover }),
        /使用现有封面/,
      )
      assert.equal((await catalog.detail(work.rank)).coverUrl, work.coverUrl)
      await awards.nominate(other, c.id, prefix, '', '')
      assert.equal((await awards.nominations(c.id)).length, 2)
      const overQuota = prefix + '-quota'
      await assert.rejects(
        () => awards.nominate(member, c.id, overQuota, '', '', { coverAssetId: ownCover }),
        /提名上限/,
      )
      assert.ok(!(await catalog.works()).some((work) => work.title === overQuota))
      const ownNomination = (await awards.nominations(c.id)).find((n) => n.accountId === member.id)!
      await awards.nominationAction(member, c.id, ownNomination.id, 'withdrawn')
      await awards.nominate(member, c.id, prefix + '-no-cover', '', '')
      assert.equal(
        (await catalog.publicWorks()).find((work) => work.title === prefix + '-no-cover')!.coverUrl,
        undefined,
      )
    } finally {
      await db.pool.end()
    }
  },
)
