import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { replyRootResolver } from '../src/reply-threads'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Forum } from '../src/forum'
import { Community } from '../src/community'

test('回复归属不受查询顺序、缺失根节点、深层对话或异常环影响', () => {
  const root = replyRootResolver([
    { id: 'third', parentId: 'second' },
    { id: 'second', parentId: 'first' },
    { id: 'orphan', parentId: 'unavailable' },
    { id: 'a', parentId: 'b' },
    { id: 'b', parentId: 'a' },
  ])
  assert.equal(root('third'), 'first')
  assert.equal(root('second'), 'first')
  assert.equal(root('first'), 'first')
  assert.equal(root('orphan'), 'unavailable')
  assert.equal(root('b'), 'a')
  assert.equal(root('a'), 'a')
  const deep = replyRootResolver(
    Array.from({ length: 20000 }, (_, i) => ({ id: String(i + 1), parentId: String(i) })),
  )
  assert.equal(deep('20000'), '0')
})

test(
  '评论线程及通知：多级归属、具体原文、去重收件、跨帖拦截与隐藏内容保护',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      forum = new Forum(db, platform),
      community = new Community(db, platform)
    async function actor(role: Actor['role']): Promise<Actor> {
      const id = randomUUID()
      await db.execute(
        'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
        [
          id,
          id + '@example.com',
          id + '@example.com',
          '同好' + id.slice(0, 5),
          'unused',
          role,
          Date.now(),
          Date.now(),
        ],
      )
      return { id, role, nickname: '同好' + id.slice(0, 5), status: 'active' }
    }
    try {
      const owner = await actor('admin'),
        member = await actor('member'),
        other = await actor('member')
      const post = await forum.create(owner, {
        title: '线程通知测试',
        content: '用于验证具体回复的归属和通知上下文。',
        category: '同好闲聊',
        spoiler: false,
        image: 2,
      })
      const first = await forum.reply(member, post.id, '最初评论的内容')
      const second = await forum.reply(other, post.id, '回复这条评论', first.id)
      const third = await forum.reply(owner, post.id, '继续回复第二条', second.id)
      const separate = await forum.reply(other, post.id, '独立的第二条评论')
      let rows = await forum.replies(post.id)
      for (const id of [first.id, second.id, third.id])
        assert.equal(rows.find((r) => r.id === id)?.threadId, first.id)
      assert.equal(rows.find((r) => r.id === separate.id)?.threadId, separate.id)
      assert.equal(rows.find((r) => r.id === third.id)?.parentId, second.id)
      const inbox = await community.inbox(member, 1)
      assert.equal(inbox.items.length, 1)
      assert.equal(inbox.items[0]?.postId, post.id)
      assert.equal(inbox.items[0]?.postTitle, '线程通知测试')
      assert.equal(inbox.items[0]?.replyAuthorId, other.id)
      assert.equal(inbox.items[0]?.replyAvatarUrl, null)
      assert.equal(Number(inbox.items[0]?.postImage), 2)
      assert.equal(inbox.items[0]?.replyId, second.id)
      assert.equal(inbox.items[0]?.parentId, first.id)
      assert.equal(inbox.items[0]?.parentExcerpt, '最初评论的内容')
      assert.equal(inbox.items[0]?.excerpt, '回复这条评论')
      assert.equal(Number(inbox.items[0]?.replyToMe), 1)
      assert.equal(inbox.items[0]?.link, `/post/${post.id}#reply-${second.id}`)
      const authorInbox = await community.inbox(owner, 1)
      assert.equal(authorInbox.items.filter((item) => item.replyId === second.id).length, 1)
      assert.equal(authorInbox.items.filter((item) => item.replyId === third.id).length, 0, '不给自己发通知')
      const another = await forum.create(owner, {
        title: '另一篇讨论',
        content: '这个帖子不得回复其他帖子的留言。',
        category: '同好闲聊',
        spoiler: false,
      })
      await assert.rejects(() => forum.reply(other, another.id, '跨帖回复', first.id), /不存在/)
      await forum.moderateReply(owner, second.id, 'hidden')
      rows = await forum.replies(post.id)
      assert.equal(
        rows.some((r) => r.id === second.id),
        false,
      )
      assert.equal(rows.find((r) => r.id === third.id)?.threadId, first.id)
      assert.equal(rows.find((r) => r.id === third.id)?.parentUnavailable, true)
      const protectedNotice = (await community.inbox(other, 1)).items.find(
        (item) => item.replyId === third.id,
      )
      assert.equal(protectedNotice?.parentId, second.id)
      assert.equal(protectedNotice?.parentExcerpt, null)
      assert.equal(protectedNotice?.parentAuthor, null)
      assert.equal((await community.inbox(member, 1)).total, 0, '新回复被隐藏后不留可点击通知')
      await forum.moderateReply(owner, first.id, 'hidden')
      assert.equal(
        (await forum.replies(post.id)).find((r) => r.id === third.id)?.threadId,
        first.id,
        '根评论被隐藏后仍保留对话归属',
      )
      await forum.edit(owner, post.id, { title: '修改后的帖子标题', spoiler: true })
      assert.equal((await community.inbox(other, 1)).items[0]?.postTitle, '修改后的帖子标题')
      assert.equal(
        (await community.inbox(other, 1)).items[0]?.postImage,
        null,
        '剧透帖配图不在通知中直接展示',
      )
      await forum.edit(owner, post.id, { status: 'hidden' })
      assert.equal((await community.inbox(other, 1)).total, 0)
    } finally {
      await db.pool.end()
    }
  },
)
