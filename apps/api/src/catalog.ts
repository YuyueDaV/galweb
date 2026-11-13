import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { PoolConnection } from 'mysql2/promise'
import { Database } from './database'
import { Platform, staff, reject, type Actor } from './platform'
import { decode } from './forum'
import { normalizeWorkTitle } from './award-rules'
import { Bangumi, type BangumiSubject } from './bangumi'
import { workAwardHonors, type PublishedAward, type AwardHonor } from './award-honors'
import { TierVoting, validTierChoices, tierPublicationKey, type TierChoice } from './tier-voting'

export interface CatalogWork {
  addedById?: string
  addedAt?: number
  coverAssetId?: string | null
  displayOrder?: number
  rank: number
  title: string
  subtitle: string
  studio: string
  description: string
  nominator: string
  color: string
  archiveRank?: number
  awardHonors?: AwardHonor[]
  version: number
  bangumi?: BangumiSubject
  catalogVisible?: boolean
  catalogDeleted?: boolean
  removedAt?: number
}
export const workContributionSchema = z
  .object({
    subjectId: z.number().int().positive().max(2147483647).nullable().default(null),
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(160).default(''),
    studio: z.string().trim().max(200).default(''),
    description: z.string().trim().max(8000).default(''),
    coverAssetId: z.uuid().nullable().default(null),
  })
  .strict()
const publicWorkSelect =
  "SELECT w.id,w.data,u.id AS contributorId,u.nickname AS contributorName,u.status AS contributorStatus,a.id AS activeCover,EXISTS(SELECT 1 FROM award_nominations n WHERE JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.coverRank'))=CAST(w.id AS CHAR)) AS submittedForAwards FROM works w LEFT JOIN users u ON u.id=JSON_UNQUOTE(JSON_EXTRACT(w.data,'$.addedById')) LEFT JOIN assets a ON a.id=JSON_UNQUOTE(JSON_EXTRACT(w.data,'$.coverAssetId')) AND a.status='active'"
type PublicWorkRow = {
  submittedForAwards?: number
  id: number
  data: unknown
  contributorId?: string
  contributorName?: string
  contributorStatus?: string
  activeCover?: string
}
function workKeys(work: Pick<CatalogWork, 'title' | 'subtitle' | 'bangumi'>) {
  return [work.title, work.subtitle, work.bangumi?.title, work.bangumi?.originalTitle]
    .filter((s): s is string => !!s)
    .map(normalizeWorkTitle)
    .filter(Boolean)
}
export const workEditSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(160),
    studio: z.string().trim().max(200),
    description: z.string().trim().max(8000),
    nominator: z.string().trim().max(200),
    version: z.number().int().min(0),
  })
  .strict()
const orderedIds = z
  .array(z.number().int().positive().max(2147483647))
  .min(1)
  .max(5000)
  .refine((ids) => new Set(ids).size === ids.length, '排序中不能包含重复作品。')
export const catalogOrderSchema = z.object({ workIds: orderedIds, previousWorkIds: orderedIds }).strict()
export const tierSchema = z
  .object({
    title: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    rows: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
            label: z.string().trim().min(1).max(24),
            color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
            workIds: z.array(z.number().int().positive()).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    version: z.number().int().min(0),
    action: z.enum(['save', 'publish', 'unpublish']).default('save'),
  })
  .strict()
  .superRefine((input, ctx) => {
    const ids = input.rows.flatMap((row) => row.workIds)
    if (
      ids.length > 200 ||
      new Set(ids).size !== ids.length ||
      new Set(input.rows.map((row) => row.id)).size !== input.rows.length
    )
      ctx.addIssue({ code: 'custom', message: '作品或分层不能重复，每个榜单最多 200 部作品。' })
    if (input.action === 'publish' && !ids.length)
      ctx.addIssue({ code: 'custom', message: '请先添加作品再发布榜单。' })
  })
type TierData = Pick<z.infer<typeof tierSchema>, 'title' | 'description' | 'rows'>
interface TierRow {
  id: string
  draft: TierData | string
  published: TierData | string | null
  version: number
  updated_at: number
  ownerId?: string | null
  authorName?: string | null
  ownerStatus?: string | null
  avatarId?: string | null
  blocked?: boolean
}
const tierSelect =
  "SELECT t.*,o.user_id AS ownerId,o.blocked,u.nickname AS authorName,u.status AS ownerStatus,a.id AS avatarId FROM tier_lists t LEFT JOIN tier_owners o ON o.tier_id=t.id LEFT JOIN users u ON u.id=o.user_id LEFT JOIN assets a ON a.id=u.avatar_asset_id AND a.user_id=u.id AND a.status='active'"
export class Catalog {
  constructor(
    private db: Database,
    private platform: Platform,
    readonly bangumi = new Bangumi(),
  ) {}
  private async write<T>(
    actor: Actor,
    run: (tx: PoolConnection, current: Actor) => Promise<T>,
    requireStaff = true,
  ) {
    if (requireStaff) staff(actor)
    return this.db.transaction(async (tx) => {
      await this.platform.lock('catalog', tx)
      const current = await this.platform.actor(actor.id, tx)
      if (requireStaff) staff(current)
      return run(tx, current)
    })
  }
  private work(row: { id: number; data: unknown }): CatalogWork {
    const data = decode(row.data) as CatalogWork
    return {
      ...data,
      rank: row.id,
      archiveRank: data.archiveRank ?? (row.id <= 12 ? row.id : undefined),
      version: data.version || 0,
    }
  }
  async works(tx?: PoolConnection) {
    return (
      await this.db.rows<{ id: number; data: unknown }>('SELECT id,data FROM works ORDER BY id', [], tx)
    ).map((row) => this.work(row))
  }
  async requireWorkManager(actor: Actor, id: number, tx: PoolConnection) {
    if (actor.role === 'super_admin') return
    const submitted = await this.db.rows(
      "SELECT id FROM award_nominations WHERE JSON_UNQUOTE(JSON_EXTRACT(data,'$.coverRank'))=? LIMIT 1",
      [String(id)],
      tx,
    )
    if (submitted.length) throw reject('该作品已提交提名，资料、封面与书库关联仅限超级管理员修改。', 403)
  }
  // Called inside the nomination transaction: a failed nomination must not leave a new work behind.
  async nominationWork(
    actor: Actor,
    tx: PoolConnection,
    input: {
      title: string
      studio: string
      workId?: number
      subject?: BangumiSubject
      coverAssetId?: string
    },
  ) {
    await this.platform.lock('catalog', tx)
    const all = await this.works(tx)
    const proposed = { title: input.subject?.title || input.title, subtitle: '', bangumi: input.subject }
    const keys = workKeys(proposed)
    const existing = input.workId
      ? all.find((work) => work.rank === input.workId)
      : (input.subject && all.find((work) => work.bangumi?.id === input.subject!.id)) ||
        all.find(
          (work) =>
            (input.subject && work.bangumi?.id === input.subject.id) ||
            workKeys(work).some((key) => keys.includes(key)),
        )
    if (input.workId && !existing) throw reject('所选书库作品不存在，请重新选择。', 404)
    if (existing?.catalogDeleted) throw reject('该作品已被管理员移出书库，暂时无法提名。', 409)
    if (input.subject && existing?.bangumi && existing.bangumi.id !== input.subject.id)
      throw reject('同名作品已关联其他 Bangumi 条目，请确认作品版本或联系管理员。', 409)
    if (input.coverAssetId && existing)
      throw reject('该作品已在书库中，请使用现有封面；如需修改，请前往作品页面。', 409)
    if (existing && existing.catalogVisible !== false) {
      if (!existing.studio?.trim() && input.studio.trim()) {
        await this.requireWorkManager(actor, existing.rank, tx)
        const completed = { ...existing, studio: input.studio.trim(), version: existing.version + 1 }
        await this.db.execute(
          'UPDATE works SET data=? WHERE id=?',
          [JSON.stringify(completed), existing.rank],
          tx,
        )
        await this.platform.audit(actor, '提名补全书库作品制作组 ' + existing.rank, null, tx)
        return completed
      }
      return existing
    }
    if (input.coverAssetId) await this.requireCover(actor, input.coverAssetId, tx)
    if (existing) await this.requireWorkManager(actor, existing.rank, tx)
    const work: CatalogWork = {
      ...existing,
      rank: existing?.rank || Math.max(12, ...all.map((work) => work.rank)) + 1,
      title: existing?.title || proposed.title,
      subtitle: existing?.subtitle || input.subject?.originalTitle || '',
      studio: input.studio.trim() || existing?.studio || input.subject?.studio || '',
      description: existing?.description || input.subject?.summary || '',
      nominator: existing?.nominator || '成员收录',
      color: existing?.color || '#91a893',
      version: (existing?.version || 0) + 1,
      ...(input.subject && !existing?.bangumi ? { bangumi: input.subject } : {}),
      catalogVisible: true,
      addedById: existing?.addedById || actor.id,
      addedAt: existing?.addedAt || Date.now(),
      ...(input.coverAssetId ? { coverAssetId: input.coverAssetId } : {}),
    }
    if (existing)
      await this.db.execute('UPDATE works SET data=? WHERE id=?', [JSON.stringify(work), work.rank], tx)
    else
      await this.db.execute('INSERT INTO works(id,data) VALUES (?,?)', [work.rank, JSON.stringify(work)], tx)
    await this.platform.audit(actor, '提名收录书库作品 ' + work.rank, null, tx)
    return work
  }
  private publicWork(row: PublicWorkRow, published: PublishedAward[] = []) {
    const { addedById, ...work } = this.work(row)
    return {
      ...work,
      submittedForAwards: !!row.submittedForAwards,
      awardHonors: workAwardHonors(work.rank, work.archiveRank, published),
      coverUrl: row.activeCover ? '/api/assets/' + row.activeCover : undefined,
      addedBy: addedById
        ? {
            id: row.contributorStatus === 'deleted' ? null : row.contributorId || null,
            name: row.contributorStatus === 'deleted' ? '已注销用户' : row.contributorName || '同好',
          }
        : null,
    }
  }
  async publicWorks(tx?: PoolConnection) {
    const published = await this.publishedAwards(tx)
    return (await this.db.rows<PublicWorkRow>(publicWorkSelect + ' ORDER BY w.id', [], tx))
      .map((row) => this.publicWork(row, published))
      .filter((work) => work.catalogVisible !== false && !work.catalogDeleted)
      .sort((a, b) => {
        const position = (work: CatalogWork) =>
          Number.isSafeInteger(work.displayOrder) && work.displayOrder! >= 0
            ? work.displayOrder!
            : Number.MAX_SAFE_INTEGER
        return position(a) - position(b) || a.rank - b.rank
      })
  }
  async reorder(actor: Actor, input: z.infer<typeof catalogOrderSchema>) {
    return this.write(actor, async (tx, current) => {
      const visible = await this.publicWorks(tx),
        ids = visible.map((work) => work.rank)
      if (JSON.stringify(ids) !== JSON.stringify(input.previousWorkIds))
        throw reject('书库或排序已被更新，请重新加载后再排序。', 409)
      const wanted = new Set(input.workIds)
      if (
        wanted.size !== ids.length ||
        input.workIds.length !== ids.length ||
        ids.some((id) => !wanted.has(id))
      )
        throw reject('排序必须包含全部公开书库作品，不能遗漏或添加其他作品。', 422)
      for (const [index, id] of input.workIds.entries())
        await this.db.execute(
          "UPDATE works SET data=JSON_SET(data,'$.displayOrder',?) WHERE id=?",
          [index, id],
          tx,
        )
      await this.platform.audit(current, '调整公开书库顺序', null, tx)
      return this.publicWorks(tx)
    })
  }
  async detail(id: number) {
    const row = (await this.db.rows<PublicWorkRow>(publicWorkSelect + ' WHERE w.id=?', [id]))[0]
    if (!row) throw reject('作品不存在。', 404)
    return this.publicWork(row, await this.publishedAwards())
  }
  private publishedAwards(tx?: PoolConnection) {
    return this.db.rows<PublishedAward>(
      "SELECT c.id AS campaignId,c.edition,c.data AS campaign,JSON_OBJECT('results',JSON_EXTRACT(r.data,'$.results')) AS results FROM award_campaigns c JOIN award_results r ON r.campaign_id=c.id WHERE JSON_EXTRACT(c.data,'$.deletedAt') IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(c.data,'$.phase')) IN ('results','archived') ORDER BY c.edition DESC",
      [],
      tx,
    )
  }
  async remove(actor: Actor, id: number, version: number) {
    return this.write(actor, async (tx, current) => {
      const work = (await this.works(tx)).find((work) => work.rank === id)
      if (!work || work.catalogVisible === false || work.catalogDeleted)
        throw reject('作品不存在或已移出书库。', 404)
      await this.requireWorkManager(current, id, tx)
      if (work.version !== version) throw reject('作品已更新，请刷新后再删除。', 409)
      await this.db.execute(
        'UPDATE works SET data=? WHERE id=?',
        [
          JSON.stringify({
            ...work,
            catalogVisible: false,
            catalogDeleted: true,
            removedAt: Date.now(),
            displayOrder: undefined,
            version: version + 1,
          }),
          id,
        ],
        tx,
      )
      await this.platform.audit(current, '删除书库作品 ' + id + ' · ' + work.title, null, tx)
      return { message: '作品已从书库删除，关联历史记录已保留。' }
    })
  }
  async contribute(actor: Actor, input: z.infer<typeof workContributionSchema>) {
    await this.platform.actor(actor.id)
    const subject = input.subjectId ? await this.bangumi.detail(input.subjectId, true) : undefined
    const rank = await this.write(
      actor,
      async (tx, current) => {
        const all = await this.works(tx)
        const proposed = {
          title: input.title,
          subtitle: input.subtitle || subject?.originalTitle || '',
          bangumi: subject,
        }
        const keys = workKeys(proposed)
        if (!normalizeWorkTitle(input.title)) throw reject('请输入有效的作品名称。', 422)
        const existing =
          all.find((work) => subject && work.bangumi?.id === subject.id) ||
          all.find((work) => workKeys(work).some((key) => keys.includes(key)))
        if (existing?.catalogDeleted && current.role === 'member')
          throw reject('此作品已被管理员移出书库，需要管理员重新收录。', 403)
        if (existing && existing.catalogVisible !== false && !existing.catalogDeleted)
          throw reject('书库已存在《' + existing.title + '》，请直接查看已有作品。', 409)
        if (existing?.bangumi && subject && existing.bangumi.id !== subject.id)
          throw reject('已有同名作品，请核对作品及 Bangumi 编号。', 409)
        if (existing) await this.requireWorkManager(current, existing.rank, tx)
        if (input.coverAssetId) await this.requireCover(current, input.coverAssetId, tx)
        const id = existing?.rank || Math.max(12, ...all.map((work) => work.rank)) + 1
        if (id > 2147483647) throw reject('书库编号已达上限。')
        const work: CatalogWork = {
          ...existing,
          rank: id,
          title: input.title,
          subtitle: proposed.subtitle,
          studio: input.studio || subject?.studio || '',
          description: input.description || subject?.summary || '',
          nominator: '成员收录',
          color: existing?.color || '#d97542',
          version: (existing?.version || 0) + 1,
          ...(subject ? { bangumi: subject } : {}),
          catalogVisible: true,
          catalogDeleted: false,
          removedAt: undefined,
          coverAssetId: input.coverAssetId,
          addedById: current.id,
          addedAt: Date.now(),
        }
        if (existing)
          await this.db.execute('UPDATE works SET data=? WHERE id=?', [JSON.stringify(work), id], tx)
        else await this.db.execute('INSERT INTO works(id,data) VALUES (?,?)', [id, JSON.stringify(work)], tx)
        await this.platform.audit(current, '添加书库作品 ' + id, null, tx)
        return id
      },
      false,
    )
    return this.detail(rank)
  }
  private async requireCover(actor: Actor, id: string, tx: PoolConnection) {
    if (
      !(
        await this.db.rows(
          "SELECT id FROM assets WHERE id=? AND user_id=? AND status='active' FOR UPDATE",
          [id, actor.id],
          tx,
        )
      ).length
    )
      throw reject('封面图片不可用或不属于当前账号。', 422)
  }
  async changeCover(actor: Actor, id: number, assetId: string | null, version: number) {
    await this.write(
      actor,
      async (tx, current) => {
        const work = (await this.works(tx)).find((work) => work.rank === id)
        if (!work) throw reject('作品不存在。', 404)
        if (work.catalogDeleted) throw reject('作品已移出书库，请刷新后重试。', 409)
        await this.requireWorkManager(current, id, tx)
        if (current.role === 'member' && work.addedById !== current.id)
          throw reject('只能修改自己添加作品的封面。', 403)
        if (work.version !== version) throw reject('作品已更新，请刷新后重试。', 409)
        if (assetId) await this.requireCover(current, assetId, tx)
        await this.db.execute(
          'UPDATE works SET data=? WHERE id=?',
          [JSON.stringify({ ...work, coverAssetId: assetId, version: version + 1 }), id],
          tx,
        )
        await this.platform.audit(current, '修改作品封面 ' + id, null, tx)
      },
      false,
    )
    return this.detail(id)
  }
  async import(actor: Actor, subjectId: number, existingWorkId?: number, version?: number) {
    staff(await this.platform.actor(actor.id))
    const subject = await this.bangumi.detail(subjectId, true)
    return this.write(actor, async (tx, current) => {
      const all = await this.works(tx),
        duplicate =
          all.find((work) => work.bangumi?.id === subjectId && work.catalogVisible !== false) ||
          all.find((work) => work.bangumi?.id === subjectId) ||
          (!existingWorkId
            ? all.find((work) =>
                workKeys(work).some((key) =>
                  [subject.title, subject.originalTitle].map(normalizeWorkTitle).includes(key),
                ),
              )
            : undefined)
      if (duplicate && (duplicate.catalogVisible === false || duplicate.catalogDeleted) && !existingWorkId) {
        await this.requireWorkManager(current, duplicate.rank, tx)
        const work = {
          ...duplicate,
          catalogVisible: true,
          catalogDeleted: false,
          removedAt: undefined,
          addedById: current.id,
          addedAt: Date.now(),
          version: duplicate.version + 1,
        }
        await this.db.execute('UPDATE works SET data=? WHERE id=?', [JSON.stringify(work), work.rank], tx)
        await this.platform.audit(current, '将 Bangumi 作品加入公开书库 ' + subjectId, null, tx)
        return { work, reused: false }
      }
      if (
        duplicate &&
        duplicate.rank !== existingWorkId &&
        (duplicate.catalogVisible !== false || !existingWorkId)
      )
        return { work: duplicate, reused: true }
      const existing = existingWorkId ? all.find((work) => work.rank === existingWorkId) : undefined
      if (existingWorkId && !existing) throw reject('待关联的书库作品不存在。', 404)
      if (existing) await this.requireWorkManager(current, existing.rank, tx)
      if (existing && existing.version !== version) throw reject('作品已被其他管理员修改，请刷新后重试。')
      if (existing?.bangumi && existing.bangumi.id !== subjectId)
        throw reject('该作品已关联其他 Bangumi 条目，请核对后使用新作品导入。')
      const id = existing?.rank || Math.max(12, ...all.map((work) => work.rank)) + 1
      if (id > 2147483647) throw reject('书库编号已达上限。')
      const work: CatalogWork = existing
        ? { ...existing, bangumi: subject, version: existing.version + 1 }
        : {
            rank: id,
            title: subject.title,
            subtitle: subject.originalTitle,
            studio: subject.studio,
            description: subject.summary,
            nominator: '管理员收录',
            addedById: current.id,
            addedAt: Date.now(),
            color: '#d97542',
            bangumi: subject,
            version: 1,
          }
      if (existing)
        await this.db.execute('UPDATE works SET data=? WHERE id=?', [JSON.stringify(work), id], tx)
      else await this.db.execute('INSERT INTO works(id,data) VALUES (?,?)', [id, JSON.stringify(work)], tx)
      await this.platform.audit(current, '导入或关联 Bangumi 作品 ' + subjectId + ' → ' + id, null, tx)
      return { work, reused: false }
    })
  }
  async importTierWork(actor: Actor, subjectId: number) {
    await this.platform.actor(actor.id)
    const subject = await this.bangumi.detail(subjectId, true)
    return this.write(
      actor,
      async (tx) => {
        const all = await this.works(tx),
          existing =
            all.find((work) => work.bangumi?.id === subjectId && work.catalogVisible !== false) ||
            all.find((work) => work.bangumi?.id === subjectId)
        if (existing) return { work: existing, reused: true }
        const id = Math.max(12, ...all.map((work) => work.rank)) + 1
        if (id > 2147483647) throw reject('作品编号已达上限。')
        const work: CatalogWork = {
          rank: id,
          title: subject.title,
          subtitle: subject.originalTitle,
          studio: subject.studio,
          description: subject.summary,
          nominator: 'Bangumi 资料',
          color: '#d97542',
          version: 1,
          bangumi: subject,
          catalogVisible: false,
        }
        await this.db.execute('INSERT INTO works(id,data) VALUES (?,?)', [id, JSON.stringify(work)], tx)
        return { work, reused: false }
      },
      false,
    )
  }
  async edit(actor: Actor, id: number, input: z.infer<typeof workEditSchema>) {
    return this.write(actor, async (tx, current) => {
      const row = (
        await this.db.rows<{ id: number; data: unknown }>(
          'SELECT id,data FROM works WHERE id=? FOR UPDATE',
          [id],
          tx,
        )
      )[0]
      if (!row) throw reject('作品不存在。', 404)
      await this.requireWorkManager(current, id, tx)
      const previous = this.work(row)
      if (previous.version !== input.version) throw reject('作品已被其他管理员修改，请刷新后重试。')
      const work = { ...previous, ...input, version: input.version + 1 }
      await this.db.execute('UPDATE works SET data=? WHERE id=?', [JSON.stringify(work), id], tx)
      await this.platform.audit(current, '编辑书库作品 ' + id, null, tx)
      return work
    })
  }
  private tier(row: TierRow, admin: boolean) {
    const data = decode(admin ? row.draft : row.published) as TierData | null
    return {
      id: row.id,
      ...(data || { title: '已撤回的个人榜单', description: '', rows: [] }),
      ...(admin ? { version: row.version, isPublished: row.published !== null && !row.blocked } : {}),
      updatedAt: Number(row.updated_at),
      mode: row.ownerId ? ('personal' as const) : ('community' as const),
      author: row.ownerId
        ? {
            id: row.ownerId,
            name: row.authorName || '同好',
            avatarUrl: row.avatarId ? '/api/assets/' + row.avatarId : null,
          }
        : null,
      blocked: !!row.blocked,
    }
  }
  async tiers(admin?: Actor) {
    if (admin) staff(admin)
    const lists = (
      await this.db.rows<TierRow>(
        tierSelect +
          (admin
            ? ' WHERE o.user_id IS NULL'
            : " WHERE t.published IS NOT NULL AND (o.user_id IS NULL OR (u.status='active' AND o.blocked=0))") +
          ' ORDER BY t.updated_at DESC,t.id',
      )
    ).map((row) => this.tier(row, !!admin))
    if (admin) return lists
    const counts = await this.db.rows<{ id: string; participants: number }>(
      "SELECT b.tier_id AS id,COUNT(*) AS participants FROM tier_ballots b JOIN users u ON u.id=b.user_id JOIN tier_lists t ON t.id=b.tier_id WHERE t.published IS NOT NULL AND u.status='active' AND JSON_LENGTH(b.data)>0 GROUP BY b.tier_id",
    )
    return lists.map((list) => ({
      ...list,
      participants: Number(counts.find((row) => row.id === list.id)?.participants || 0),
    }))
  }
  async tierDetail(id: string, admin?: Actor) {
    if (admin) staff(admin)
    const row = (
      await this.db.rows<TierRow>(
        tierSelect +
          ' WHERE t.id=?' +
          (admin
            ? ' AND o.user_id IS NULL'
            : " AND t.published IS NOT NULL AND (o.user_id IS NULL OR (u.status='active' AND o.blocked=0))"),
        [id],
      )
    )[0]
    if (!row) throw reject('榜单不存在或尚未发布。', 404)
    const result = this.tier(row, !!admin)
    if (admin) return result
    const ids = new Set(result.rows.flatMap((level) => level.workIds)),
      works = (await this.works()).filter((work) => ids.has(work.rank))
    return result.mode === 'personal'
      ? { ...result, works }
      : {
          ...result,
          works,
          publicationKey: tierPublicationKey(decode(row.published)),
          stats: await new TierVoting(this.db, this.platform).stats(id, result.rows),
        }
  }
  async myTiers(actor: Actor) {
    await this.platform.actor(actor.id)
    const rows = await this.db.rows<TierRow>(
      tierSelect + ' WHERE o.user_id=? ORDER BY t.updated_at DESC,t.id',
      [actor.id],
    )
    const items = rows.map((row) => this.tier(row, true)),
      ids = new Set(items.flatMap((item) => item.rows.flatMap((level) => level.workIds)))
    return { items, works: (await this.works()).filter((work) => ids.has(work.rank)) }
  }
  async createTier(actor: Actor, title: string, personal = false) {
    return this.write(
      actor,
      async (tx, current) => {
        const id = randomUUID(),
          rows = ['S', 'A', 'B', 'C', 'D'].map((label, index) => ({
            id: label.toLowerCase(),
            label,
            color: ['#eaa69b', '#edbd8b', '#e4d68f', '#b3d1a0', '#9dbed5'][index]!,
            workIds: [] as number[],
          }))
        await this.db.execute(
          'INSERT INTO tier_lists(id,draft,version,updated_at) VALUES (?,?,0,?)',
          [id, JSON.stringify({ title, description: '', rows }), Date.now()],
          tx,
        )
        if (personal)
          await this.db.execute('INSERT INTO tier_owners(tier_id,user_id) VALUES (?,?)', [id, current.id], tx)
        await this.platform.audit(current, '创建 Tier 榜单 ' + id, null, tx)
        return {
          id,
          title,
          description: '',
          rows,
          version: 0,
          isPublished: false,
          updatedAt: Date.now(),
          mode: personal ? 'personal' : 'community',
        }
      },
      !personal,
    )
  }
  async saveTier(actor: Actor, id: string, input: z.infer<typeof tierSchema>, personal = false) {
    return this.write(
      actor,
      async (tx, current) => {
        const row = (
          await this.db.rows<TierRow>('SELECT * FROM tier_lists WHERE id=? FOR UPDATE', [id], tx)
        )[0]
        if (!row) throw reject('榜单不存在。', 404)
        const owner = (
          await this.db.rows<{ user_id: string; blocked: boolean }>(
            'SELECT user_id,blocked FROM tier_owners WHERE tier_id=?',
            [id],
            tx,
          )
        )[0]
        if (personal ? owner?.user_id !== current.id : !!owner) throw reject('个人榜单仅限作者编辑。', 403)
        if (owner?.blocked && input.action === 'publish')
          throw reject('该个人榜单已被管理员下架，目前仅可保存草稿。')
        if (row.version !== input.version) throw reject('榜单已被其他管理员修改，请刷新后重试。')
        const ids = input.rows.flatMap((level) => level.workIds),
          all = await this.works(tx)
        if (ids.some((workId) => !all.some((work) => work.rank === workId)))
          throw reject('榜单含有书库中不存在的作品。', 422)
        const data: TierData = { title: input.title, description: input.description, rows: input.rows },
          json = JSON.stringify(data)
        const published =
          input.action === 'publish'
            ? json
            : input.action === 'unpublish'
              ? null
              : row.published === null
                ? null
                : JSON.stringify(decode(row.published))
        const now = Date.now()
        await this.db.execute(
          'UPDATE tier_lists SET draft=?,published=?,version=version+1,updated_at=? WHERE id=?',
          [json, published, now, id],
          tx,
        )
        if (input.action === 'publish' && !personal) {
          const ballots = await this.db.rows<{ user_id: string; data: unknown }>(
            'SELECT user_id,data FROM tier_ballots WHERE tier_id=? FOR UPDATE',
            [id],
            tx,
          )
          for (const ballot of ballots) {
            const previous = decode(ballot.data) as TierChoice[],
              choices = validTierChoices(data.rows, previous)
            if (choices.length !== previous.length)
              await this.db.execute(
                'UPDATE tier_ballots SET data=?,version=version+1,updated_at=? WHERE tier_id=? AND user_id=?',
                [JSON.stringify(choices), now, id, ballot.user_id],
                tx,
              )
          }
        }
        await this.platform.audit(current, input.action + ' Tier 榜单 ' + id, null, tx)
        return {
          id,
          ...data,
          version: input.version + 1,
          isPublished: published !== null && !owner?.blocked,
          blocked: !!owner?.blocked,
          updatedAt: now,
          mode: personal ? 'personal' : 'community',
        }
      },
      !personal,
    )
  }
  async moderation(actor: Actor) {
    staff(await this.platform.actor(actor.id))
    return (
      await this.db.rows<TierRow>(
        tierSelect +
          ' WHERE o.user_id IS NOT NULL AND (t.published IS NOT NULL OR o.blocked=1) ORDER BY t.updated_at DESC LIMIT 200',
      )
    ).map((row) => ({ ...this.tier(row, false), version: row.version }))
  }
  async moderatePersonal(actor: Actor, id: string, version: number, blocked: boolean) {
    return this.write(actor, async (tx, current) => {
      const row = (
        await this.db.rows<{ version: number }>(
          'SELECT version FROM tier_lists WHERE id=? FOR UPDATE',
          [id],
          tx,
        )
      )[0]
      if (!row) throw reject('榜单不存在。', 404)
      if (row.version !== version) throw reject('榜单已更新，请刷新后重试。')
      if (!(await this.db.rows('SELECT tier_id FROM tier_owners WHERE tier_id=?', [id], tx)).length)
        throw reject('该接口仅用于个人榜单内容审核。', 422)
      await this.db.execute('UPDATE tier_owners SET blocked=? WHERE tier_id=?', [blocked, id], tx)
      await this.db.execute(
        'UPDATE tier_lists SET version=version+1,updated_at=? WHERE id=?',
        [Date.now(), id],
        tx,
      )
      await this.platform.audit(current, (blocked ? '下架' : '恢复展示') + '个人 Tier 榜 ' + id, null, tx)
      return { message: blocked ? '个人榜单已下架。' : '个人榜单已恢复展示。' }
    })
  }
}
