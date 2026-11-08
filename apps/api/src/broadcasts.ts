import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { Database } from './database'
import { Platform, staff, reject, type Actor } from './platform'

const siteLink = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) =>
      !value ||
      (/^\/(?!\/)/.test(value) &&
        !/[\\\s]/.test(value) &&
        [...value].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
    '跳转链接必须是以 / 开头的站内路径，例如 /awards。',
  )
export const broadcastSchema = z
  .object({
    requestId: z.uuid(),
    title: z.string().trim().min(1, '请填写通知标题。').max(80),
    content: z.string().trim().min(1, '请填写通知正文。').max(2000),
    link: siteLink.default(''),
  })
  .strict()
type Notice = {
  id: string
  kind: string
  title: string
  content: string
  link: string
  recipientCount: number
  createdAt: number
}

export class Broadcasts {
  constructor(
    private db: Database,
    private platform: Platform,
  ) {}

  // Call inside the same transaction as the business event. The unique event key
  // and shared lock make retries idempotent across API processes.
  async deliver(
    actor: Actor,
    eventKey: string,
    kind: 'site' | 'activity',
    title: string,
    content: string,
    link: string,
    tx: PoolConnection,
  ) {
    await this.platform.lock('site-notifications', tx)
    const existing = (
      await this.db.rows<Notice>(
        'SELECT id,kind,title,content,link,recipient_count AS recipientCount,created_at AS createdAt FROM notification_broadcasts WHERE event_key=?',
        [eventKey],
        tx,
      )
    )[0]
    if (existing) {
      if (existing.title !== title || existing.content !== content || existing.link !== link)
        throw reject('这次发送已完成；请刷新后创建新的通知。', 409)
      return { ...existing, reused: true }
    }
    const id = randomUUID(),
      createdAt = Date.now()
    await this.db.execute(
      'INSERT INTO notification_broadcasts(id,actor_id,event_key,kind,title,content,link,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [id, actor.id, eventKey, kind, title, content, link, createdAt],
      tx,
    )
    // Read without locking every user row: concurrent senders and role changes
    // must not deadlock while a broadcast fans out to their accounts.
    const recipients = await this.db.rows<{ id: string }>(
      "SELECT id FROM users WHERE status='active' ORDER BY id",
      [],
      tx,
    )
    for (let start = 0; start < recipients.length; start += 500) {
      const batch = recipients.slice(start, start + 500)
      await this.db.execute(
        'INSERT INTO notification_broadcast_recipients(broadcast_id,user_id) VALUES ' +
          batch.map(() => '(?,?)').join(','),
        batch.flatMap((recipient) => [id, recipient.id]),
        tx,
      )
    }
    await this.db.execute(
      'UPDATE notification_broadcasts SET recipient_count=? WHERE id=?',
      [recipients.length, id],
      tx,
    )
    await this.platform.audit(
      actor,
      `发送${kind === 'site' ? '站点' : '活动'}通知：${title}（${recipients.length} 人）`,
      null,
      tx,
    )
    return {
      id,
      kind,
      title,
      content,
      link,
      createdAt,
      recipientCount: recipients.length,
      reused: false,
    }
  }

  async send(actor: Actor, input: z.infer<typeof broadcastSchema>) {
    staff(actor)
    return this.db.transaction(async (tx) => {
      await this.platform.lock(`account:${actor.id}`, tx)
      const current = await this.platform.actor(actor.id, tx)
      staff(current)
      return this.deliver(
        current,
        `manual:${current.id}:${input.requestId}`,
        'site',
        input.title,
        input.content,
        input.link,
        tx,
      )
    })
  }

  async history(actor: Actor, page: number) {
    staff(await this.platform.actor(actor.id))
    const items = await this.db.rows(
      `SELECT b.id,b.kind,b.title,b.content,b.link,b.recipient_count AS recipientCount,b.created_at AS createdAt,u.nickname AS sender FROM notification_broadcasts b JOIN users u ON u.id=b.actor_id ORDER BY b.created_at DESC,b.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
    )
    const total = (await this.db.rows<{ n: number }>('SELECT COUNT(*) n FROM notification_broadcasts'))[0]!.n
    const active = (
      await this.db.rows<{ n: number }>("SELECT COUNT(*) n FROM users WHERE status='active'")
    )[0]!.n
    return { items, total: Number(total), activeUsers: Number(active), page }
  }
}

// Union individual replies/reviews with broadcasts while preserving per-account
// receipts. No user receives historical broadcasts merely by registering later.
export function inboxUnion() {
  return `SELECT n.id,n.kind,n.title,n.link,n.read_at AS readAt,n.created_at AS createdAt,LEFT(r.content,160) AS excerpt,NULL AS content FROM notifications n LEFT JOIN forum_posts p ON p.id=n.post_id LEFT JOIN forum_replies r ON r.id=n.reply_id WHERE n.user_id=? AND (n.post_id IS NULL OR (p.status='published' AND (n.reply_id IS NULL OR r.status='published')))
    UNION ALL SELECT b.id,b.kind,b.title,b.link,r.read_at AS readAt,b.created_at AS createdAt,LEFT(b.content,160) AS excerpt,b.content FROM notification_broadcast_recipients r JOIN notification_broadcasts b ON b.id=r.broadcast_id WHERE r.user_id=?`
}
