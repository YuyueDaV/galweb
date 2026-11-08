import { z } from 'zod'
import { Database } from './database'
import { Platform, reject, type Actor } from './platform'
import { decode } from './forum'
import { digest } from './security'

export interface TierChoice {
  workId: number
  rowId: string
}
type Level = { id: string; workIds: number[] }
type Published = { rows: Level[] }
export const tierBallotSchema = z
  .object({
    publicationKey: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().min(0),
    choices: z
      .array(
        z
          .object({ workId: z.number().int().positive(), rowId: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/) })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .refine(
    (input) => new Set(input.choices.map((choice) => choice.workId)).size === input.choices.length,
    '每部作品只能选择一个分层。',
  )

export function validTierChoices(rows: Level[], choices: TierChoice[]) {
  const works = new Set(rows.flatMap((row) => row.workIds)),
    levels = new Set(rows.map((row) => row.id))
  return choices.filter((choice) => works.has(choice.workId) && levels.has(choice.rowId))
}
export function tallyTierChoices(rows: Level[], ballots: TierChoice[][]) {
  const workIds = [...new Set(rows.flatMap((row) => row.workIds))]
  const works = workIds.map((workId) => ({
    workId,
    total: 0,
    counts: Object.fromEntries(rows.map((row) => [row.id, 0])) as Record<string, number>,
  }))
  const byId = new Map(works.map((work) => [work.workId, work]))
  let participants = 0
  for (const ballot of ballots) {
    const choices = validTierChoices(rows, ballot),
      seen = new Set<number>()
    if (choices.length) participants++
    for (const choice of choices) {
      if (seen.has(choice.workId)) continue
      seen.add(choice.workId)
      const work = byId.get(choice.workId)!
      work.counts[choice.rowId] = (work.counts[choice.rowId] || 0) + 1
      work.total++
    }
  }
  return { participants, works }
}
export const tierPublicationKey = (data: unknown) => digest(JSON.stringify(data))
export class TierVoting {
  constructor(
    private db: Database,
    private platform: Platform,
  ) {}
  async stats(id: string, rows: Level[]) {
    const ballots = await this.db.rows<{ data: unknown }>(
      "SELECT b.data FROM tier_ballots b JOIN users u ON u.id=b.user_id WHERE b.tier_id=? AND u.status='active'",
      [id],
    )
    return tallyTierChoices(
      rows,
      ballots.map((ballot) => decode(ballot.data) as TierChoice[]),
    )
  }
  async mine(actor: Actor, id: string) {
    await this.platform.actor(actor.id)
    const tier = (
      await this.db.rows<{ published: unknown }>(
        'SELECT published FROM tier_lists WHERE id=? AND published IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tier_owners WHERE tier_id=tier_lists.id)',
        [id],
      )
    )[0]
    if (!tier) throw reject('榜单不存在或尚未发布。', 404)
    const published = decode(tier.published) as Published
    const ballot = (
      await this.db.rows<{ data: unknown; version: number }>(
        'SELECT data,version FROM tier_ballots WHERE tier_id=? AND user_id=?',
        [id, actor.id],
      )
    )[0]
    return {
      version: ballot?.version || 0,
      publicationKey: tierPublicationKey(published),
      choices: validTierChoices(published.rows, ballot ? (decode(ballot.data) as TierChoice[]) : []),
    }
  }
  async save(actor: Actor, id: string, input: z.infer<typeof tierBallotSchema>) {
    return this.db.transaction(async (tx) => {
      // Same lock as template publication: a ballot cannot race a pool update.
      await this.platform.lock('catalog', tx)
      const current = await this.platform.actor(actor.id, tx)
      const tier = (
        await this.db.rows<{ published: unknown }>(
          'SELECT published FROM tier_lists WHERE id=? AND published IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tier_owners WHERE tier_id=tier_lists.id) FOR UPDATE',
          [id],
          tx,
        )
      )[0]
      if (!tier) throw reject('榜单不存在或尚未发布。', 404)
      const published = decode(tier.published) as Published
      if (input.publicationKey !== tierPublicationKey(published))
        throw reject('榜单设置已更新，请刷新后重新提交。')
      if (validTierChoices(published.rows, input.choices).length !== input.choices.length)
        throw reject('选择中包含不在当前榜单的作品或分层，请刷新后重试。', 422)
      const previous = (
        await this.db.rows<{ version: number }>(
          'SELECT version FROM tier_ballots WHERE tier_id=? AND user_id=? FOR UPDATE',
          [id, current.id],
          tx,
        )
      )[0]
      if ((previous?.version || 0) !== input.version)
        throw reject('你的选择已在其他页面更新，请重新加载后再修改。')
      await this.db.execute(
        'INSERT INTO tier_ballots(tier_id,user_id,data,version,updated_at) VALUES (?,?,?,1,?) ON DUPLICATE KEY UPDATE data=VALUES(data),version=version+1,updated_at=VALUES(updated_at)',
        [id, current.id, JSON.stringify(input.choices), Date.now()],
        tx,
      )
      return {
        version: input.version + 1,
        publicationKey: input.publicationKey,
        choices: input.choices,
        message: input.choices.length ? '你的分层选择已提交，统计已更新。' : '你的分层选择已撤回。',
      }
    })
  }
}
