import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { topicsSchema } from '../src/topic-schema'
import { recentTopics } from '../src/post-topics'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Forum } from '../src/forum'

test('话题规范化、数量和长度限制；每篇去重并按最近回响排序', () => {
  assert.deepEqual(topicsSchema.parse([' ＃音乐 ', '#Bangumi', 'bangumi', '阅读   手记']), [
    '音乐',
    'Bangumi',
    '阅读 手记',
  ])
  for (const tags of [
    ['#'],
    ['<script>'],
    ['a'.repeat(25)],
    ['a', 'b', 'c', 'd', 'e', 'f'],
    ['秘密\u200b话题'],
  ])
    assert.equal(topicsSchema.safeParse(tags).success, false)
  assert.deepEqual(
    recentTopics(
      [
        { tags: ['旧话题', 'Bangumi', 'bangumi'], createdAt: 1 },
        { tags: ['新话题', 'BANGUMI'], createdAt: 3 },
        { tags: ['旧话题'], createdAt: 2 },
      ],
      2,
    ),
    [
      { name: 'BANGUMI', count: 2, latestAt: 3 },
      { name: '新话题', count: 1, latestAt: 3 },
    ],
  )
})

test(
  '近期话题只统计公开帖子；精确筛选、隐藏恢复、管理员删帖及实时角色校验',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      forum = new Forum(db, new Platform(db)),
      key = 'tp' + randomUUID().slice(0, 8),
      actors: Actor[] = []
    try {
      for (const role of ['member', 'member', 'admin', 'super_admin']) {
        const id = randomUUID(),
          email = id + '@example.com'
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, email, email, role, 'unused-fixture', role, Date.now(), Date.now()],
        )
        actors.push({ id, nickname: role, role, status: 'active' })
      }
      const [author, other, admin, owner] = actors as [Actor, Actor, Actor, Actor]
      const create = (tags: string[], title = '话题功能测试帖子') =>
        forum.create(author, {
          title,
          content: '用于验证话题来源、权限与删帖后的实时变化。',
          category: '作品讨论',
          spoiler: false,
          tags,
        })
      const first = await create([key, key + '隐藏']),
        second = await create([key, key + '删除']),
        third = await create([key + '延长'], key + ' 仅标题包含话题')
      const find = async (name: string) => (await forum.topics()).find((item) => item.name === name)
      assert.equal((await find(key))?.count, 2)
      assert.equal(
        (await forum.list({ tag: '#' + key.toUpperCase(), page: 1, limit: 100 })).total,
        2,
        '精确标签忽略大小写，不匹配标题或标签前缀',
      )
      await assert.rejects(() => forum.remove(other, first.id), /管理员/)
      await forum.edit(admin, first.id, { status: 'hidden' })
      assert.equal(await find(key + '隐藏'), undefined)
      assert.equal((await find(key))?.count, 1)
      assert.equal((await forum.list({ tag: key, page: 1, limit: 100 })).total, 1)
      await forum.edit(owner, first.id, { status: 'published' })
      assert.equal((await find(key + '隐藏'))?.count, 1)
      await forum.edit(author, first.id, { tags: [key + '编辑'] })
      assert.equal(await find(key + '隐藏'), undefined)
      assert.equal((await find(key + '编辑'))?.count, 1)
      await db.execute("UPDATE users SET role='member' WHERE id=?", [admin.id])
      await assert.rejects(() => forum.remove(admin, second.id), /管理员/)
      await db.execute("UPDATE users SET role='admin' WHERE id=?", [admin.id])
      await forum.remove(admin, second.id)
      assert.equal(await find(key), undefined)
      assert.equal(await find(key + '删除'), undefined)
      await assert.rejects(() => forum.detail(second.id), /不存在/)
      await assert.rejects(() => forum.edit(owner, second.id, { status: 'published' }), /已删除/)
      await forum.edit(admin, first.id, { status: 'hidden' })
      await forum.remove(owner, first.id)
      assert.equal(await find(key + '编辑'), undefined)
      assert.equal(
        (
          await db.rows<{ n: number }>(
            "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE '删除帖子 %' AND actor_id IN (?,?)",
            [admin.id, owner.id],
          )
        )[0]!.n,
        2,
      )
      await forum.remove(author, third.id)
      // The recent window is based on public posts, so hidden/deleted rows cannot
      // evict otherwise eligible topics. An old public topic falls out after 100.
      const old = await create([key + '旧']),
        now = Date.now() + 1000
      await db.execute('UPDATE forum_posts SET created_at=? WHERE id=?', [now, old.id])
      for (let index = 0; index < 100; index++) {
        const id = randomUUID(),
          data = { id, title: '近期窗口测试', tags: [key + '近期'], createdAt: now + index + 1 }
        await db.execute(
          'INSERT INTO forum_posts(id,user_id,title,category,data,created_at) VALUES (?,?,?,?,?,?)',
          [id, author.id, data.title, '作品讨论', JSON.stringify(data), data.createdAt],
        )
      }
      assert.equal(await find(key + '旧'), undefined)
      assert.equal((await find(key + '近期'))?.count, 100)
    } finally {
      if (actors[0]) await db.execute('DELETE FROM forum_posts WHERE user_id=?', [actors[0].id])
      await db.pool.end()
    }
  },
)
