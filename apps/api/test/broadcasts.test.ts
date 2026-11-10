import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Broadcasts, broadcastSchema, broadcastEditSchema, broadcastDeleteSchema } from '../src/broadcasts'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Community } from '../src/community'
import { Awards } from '../src/awards'
import { schema } from '../src/schema'
import { notifyUser } from '../src/notifications'

test('站点通知只接受完整正文、站内路径和防重请求编号', () => {
  const input = { requestId: randomUUID(), title: '站点消息', content: '欢迎大家参与活动。' }
  assert.equal(broadcastSchema.parse(input).link, '')
  for (const link of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/\nevil'])
    assert.equal(broadcastSchema.safeParse({ ...input, link }).success, false, link)
  for (const link of ['/awards?campaign=test', '/community', '/'])
    assert.equal(broadcastSchema.safeParse({ ...input, link }).success, true)
  for (const patch of [
    { title: '' },
    { content: '' },
    { content: 'x'.repeat(2001) },
    { role: 'super_admin' },
    { userId: randomUUID() },
  ])
    assert.equal(broadcastSchema.safeParse({ ...input, ...patch }).success, false)
  const edit = { title: '修改标题', content: '修改内容', link: '/works', revision: 'a'.repeat(64) }
  assert.equal(broadcastEditSchema.safeParse(edit).success, true)
  for (const patch of [
    { title: '' },
    { content: '' },
    { link: '//evil.test' },
    { revision: '' },
    { kind: 'deleted' },
    { actor_id: randomUUID() },
    { recipientCount: 0 },
  ])
    assert.equal(broadcastEditSchema.safeParse({ ...edit, ...patch }).success, false)
  assert.equal(broadcastDeleteSchema.safeParse({ revision: edit.revision }).success, true)
  assert.equal(broadcastDeleteSchema.safeParse({ revision: edit.revision, id: randomUUID() }).success, false)
})

test(
  '通知群发：全员收件、权限、幂等、已读隔离、活动阶段原子发送',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      notices = new Broadcasts(db, platform)
    const community = new Community(db, platform),
      awards = new Awards(db, platform)
    const actors: Actor[] = []
    const create = async (role: Actor['role'], status: Actor['status'] = 'active') => {
      const id = randomUUID()
      await db.execute(
        'INSERT INTO users(id,email,email_key,nickname,password_hash,role,status,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          id,
          id + '@example.com',
          id + '@example.com',
          '通知测试',
          'unused',
          role,
          status,
          Date.now(),
          Date.now(),
        ],
      )
      const actor = { id, nickname: '通知测试', role, status } as Actor
      actors.push(actor)
      return actor
    }
    try {
      for (const sql of schema) await db.execute(sql)
      const admin = await create('admin'),
        owner = await create('super_admin'),
        member = await create('member'),
        other = await create('member')
      const disabled = await create('member', 'disabled'),
        deleted = await create('member', 'deleted')
      const input = broadcastSchema.parse({
        requestId: randomUUID(),
        title: '测试通知 ' + randomUUID(),
        content: '完整正文\n' + '内容'.repeat(150),
        link: '/community',
      })
      await assert.rejects(() => notices.send(member, input), /管理员/)
      await assert.rejects(() => notices.history(member, 1), /管理员/)
      const active = Number(
        (await db.rows<{ n: number }>("SELECT COUNT(*) n FROM users WHERE status='active'"))[0]!.n,
      )
      const [first, repeated] = await Promise.all([notices.send(admin, input), notices.send(admin, input)])
      assert.equal(first.id, repeated.id)
      assert.equal(first.recipientCount, active)
      assert.equal(
        (
          await db.rows<{ n: number }>(
            'SELECT COUNT(*) n FROM notification_broadcast_recipients WHERE broadcast_id=?',
            [first.id],
          )
        )[0]!.n,
        active,
      )
      for (const actor of [admin, owner, member, other]) {
        const inbox = await community.inbox(actor, 1)
        const item = inbox.items.find((n) => n.id === first.id)
        assert.equal(item?.content, input.content)
        assert.equal(item?.link, '/community')
        assert.equal(item?.readAt, null)
      }
      for (const actor of [disabled, deleted])
        assert.equal(
          (await community.inbox(actor, 1)).items.some((n) => n.id === first.id),
          false,
        )
      const later = await create('member')
      assert.equal((await community.inbox(later, 1)).total, 0, '新账号不接收历史群发')
      await community.read(member, first.id)
      assert.equal((await community.inbox(member, 1)).unread, 0)
      assert.equal((await community.inbox(other, 1)).unread, 1, '每个用户独立已读')
      await assert.rejects(() => notices.send(admin, { ...input, content: '修改后的正文' }), /已完成/)
      const eventKey = 'rollback:' + randomUUID()
      await assert.rejects(
        () =>
          db.transaction(async (tx) => {
            await notices.deliver(admin, eventKey, 'site', '回滚测试', '不应送达', '', tx)
            throw new Error('force rollback')
          }),
        /force rollback/,
      )
      assert.equal(
        (await db.rows('SELECT id FROM notification_broadcasts WHERE event_key=?', [eventKey])).length,
        0,
      )

      const campaign = await awards.create(admin)
      await awards.settings(admin, campaign.id, { ...campaign, winnerCount: 1 })
      const openingVersion = (await awards.campaign(campaign.id)).version!
      const opening = await Promise.allSettled([
        awards.phase(admin, campaign.id, 'nomination', openingVersion),
        awards.phase(owner, campaign.id, 'nomination', openingVersion),
      ])
      assert.equal(opening.filter((r) => r.status === 'fulfilled').length, 1)
      const announced = await db.rows<{ id: string; title: string; link: string }>(
        'SELECT id,title,link FROM notification_broadcasts WHERE event_key=?',
        ['award:' + campaign.id + ':nomination'],
      )
      assert.equal(announced.length, 1)
      assert.match(announced[0]!.title, /开放提名/)
      assert.equal(announced[0]!.link, '/awards?campaign=' + campaign.id)
      assert.ok((await community.inbox(later, 1)).items.some((n) => n.id === announced[0]!.id))
      await awards.nominate(member, campaign.id, '活动通知候选', '测试', '')
      const nomination = (await awards.nominations(campaign.id))[0]!
      await awards.nominationAction(admin, campaign.id, nomination.id, 'approved', '')
      await awards.phase(admin, campaign.id, 'voting', (await awards.campaign(campaign.id)).version!)
      assert.equal(
        (
          await db.rows('SELECT id FROM notification_broadcasts WHERE event_key=?', [
            'award:' + campaign.id + ':voting',
          ])
        ).length,
        1,
      )
      const votingVersion = (await awards.campaign(campaign.id)).version!
      await assert.rejects(() => awards.phase(member, campaign.id, 'results', votingVersion), /管理员/)
      await assert.rejects(() => awards.phase(admin, campaign.id, 'results', votingVersion), /二次投票/)
      assert.equal(
        (
          await db.rows('SELECT id FROM notification_broadcasts WHERE event_key=?', [
            `award:${campaign.id}:results`,
          ])
        ).length,
        0,
        '未成功推进的阶段不发送通知',
      )
      await awards.vote(member, campaign.id, [nomination.candidateId], 0, {
        loveId: nomination.candidateId,
        likeIds: [],
        recommendations: [],
      })
      for (const [phase, action] of [
        ['results', '结果公布'],
        ['archived', '本届已归档'],
      ] as const) {
        const version = (await awards.campaign(campaign.id)).version!
        const attempts = await Promise.allSettled([
          awards.phase(admin, campaign.id, phase, version),
          awards.phase(owner, campaign.id, phase, version),
        ])
        assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1)
        const events = await db.rows<{ id: string; title: string; content: string; link: string }>(
          'SELECT id,title,content,link FROM notification_broadcasts WHERE event_key=?',
          [`award:${campaign.id}:${phase}`],
        )
        assert.equal(events.length, 1, '并发推进只发送一次通知')
        const event = events[0]!
        assert.equal(event.title, campaign.title + ' · ' + action)
        assert.equal(event.link, '/awards?campaign=' + campaign.id)
        for (const actor of [admin, owner, member, other, later]) {
          const received = (await community.inbox(actor, 1)).items.find((item) => item.id === event.id)
          assert.equal(received?.kind, 'activity')
          assert.equal(received?.content, event.content)
          assert.equal(received?.readAt, null)
        }
        for (const actor of [disabled, deleted]) {
          assert.equal(
            (
              await db.rows(
                'SELECT user_id FROM notification_broadcast_recipients WHERE broadcast_id=? AND user_id=?',
                [event.id, actor.id],
              )
            ).length,
            0,
          )
        }
      }
      await db.transaction((tx) => notifyUser(db, other.id, 'nomination', '个人审核消息', '/awards', tx))
      await community.read(other)
      assert.equal((await community.inbox(other, 1)).unread, 0, '全部已读同时覆盖两类通知')
      assert.ok((await community.inbox(owner, 1)).unread > 0)
      const concurrent = await Promise.all([
        notices.send(admin, { ...input, requestId: randomUUID(), title: '同时发送 A' }),
        notices.send(owner, { ...input, requestId: randomUUID(), title: '同时发送 B' }),
      ])
      assert.notEqual(concurrent[0]!.id, concurrent[1]!.id)
      assert.ok((await notices.history(admin, 1)).items.some((n) => n.id === first.id))
      const edit = {
        title: '修改后的通知',
        content: '保留收件人和已读状态\n新正文',
        link: '/works',
        revision: first.revision,
      }
      await assert.rejects(() => notices.edit(member, first.id, edit), /管理员/)
      await assert.rejects(() => notices.remove(member, first.id, first.revision), /管理员/)
      const readBefore = (await community.inbox(member, 1)).items.find((item) => item.id === first.id)!.readAt
      const edits = await Promise.allSettled([
        notices.edit(admin, first.id, edit),
        notices.edit(owner, first.id, { ...edit, title: '另一位管理员同时修改' }),
      ])
      assert.equal(edits.filter((item) => item.status === 'fulfilled').length, 1)
      const saved = edits.find((item) => item.status === 'fulfilled')!.value
      assert.notEqual(saved.revision, first.revision)
      for (const actor of [member, other]) {
        const updated = (await community.inbox(actor, 1)).items.find((item) => item.id === first.id)!
        assert.equal(updated.title, saved.title)
        assert.equal(updated.content, edit.content)
        assert.equal(updated.link, edit.link)
        assert.equal(Number(updated.createdAt), Number(first.createdAt))
      }
      assert.equal(
        (await community.inbox(member, 1)).items.find((item) => item.id === first.id)!.readAt,
        readBefore,
      )
      assert.ok(!(await community.inbox(later, 1)).items.some((item) => item.id === first.id))
      await assert.rejects(() => notices.edit(owner, first.id, edit), /其他管理员修改/)
      await assert.rejects(() => notices.remove(owner, first.id, first.revision), /其他管理员修改/)
      const beforeRemoval = await community.inbox(owner, 1)
      await notices.remove(owner, first.id, saved.revision)
      const afterRemoval = await community.inbox(owner, 1)
      assert.equal(afterRemoval.total, beforeRemoval.total - 1)
      assert.equal(afterRemoval.unread, beforeRemoval.unread - 1)
      assert.ok(!(await notices.history(admin, 1)).items.some((item) => item.id === first.id))
      assert.equal(
        (await db.rows("SELECT id FROM notification_broadcasts WHERE id=? AND kind='deleted'", [first.id]))
          .length,
        1,
      )
      await assert.rejects(() => notices.send(admin, input), /已删除/)
      await assert.rejects(
        () => notices.edit(admin, first.id, { ...edit, revision: saved.revision }),
        /已删除/,
      )
      await assert.rejects(() => notices.remove(owner, first.id, saved.revision), /已删除/)
      const activity = announced[0]!
      const activityHistory = (await notices.history(admin, 1)).items.find((item) => item.id === activity.id)!
      const changedActivity = await notices.edit(owner, activity.id, {
        ...edit,
        revision: activityHistory.revision,
      })
      await notices.remove(owner, activity.id, changedActivity.revision)
      assert.ok(!(await community.inbox(later, 1)).items.some((item) => item.id === activity.id))
      const audits = await db.rows<{ action: string }>('SELECT action FROM audit_logs WHERE action LIKE ?', [
        '%' + first.id + '%',
      ])
      assert.ok(audits.some((item) => item.action.startsWith('修改通知')))
      assert.ok(audits.some((item) => item.action.startsWith('删除通知')))
      await db.execute("UPDATE users SET role='member' WHERE id=?", [admin.id])
      await assert.rejects(() => notices.send(admin, { ...input, requestId: randomUUID() }), /管理员/)
      await assert.rejects(() => notices.edit(admin, repeated.id, edit), /管理员/)
    } finally {
      await db.pool.end()
    }
  },
)
