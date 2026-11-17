import type { Awards } from './awards'
import { owner, reject, type Actor } from './platform'
import { digest } from './security'
import type { AwardNomination } from './award-types'
import { candidateActionSchema, ownerCandidateSchema } from './nomination-details'
import type { z } from 'zod'

const revision = (nominations: AwardNomination[]) =>
  digest(JSON.stringify([...nominations].sort((a, b) => a.id.localeCompare(b.id))))

export class AwardMaintenance {
  constructor(private awards: Awards) {}
  async records(actor: Actor, id: string) {
    return this.awards.mutate(actor, id, 'admin', async (_campaign, tx, current) => {
      owner(current)
      const groups = new Map<string, AwardNomination[]>()
      for (const nomination of await this.awards.nominations(id, tx, true)) {
        const entries = groups.get(nomination.candidateId) || []
        entries.push(nomination)
        groups.set(nomination.candidateId, entries)
      }
      return [...groups].map(([candidateId, nominations]) => ({
        id: candidateId,
        title: nominations[0]!.title,
        studio: nominations[0]!.studio,
        coverRank: nominations[0]!.coverRank,
        nominations,
        removed: nominations.every((n) => !!n.deletedAt),
        revision: revision(nominations),
      }))
    })
  }
  async create(actor: Actor, id: string, raw: z.input<typeof ownerCandidateSchema>) {
    const input = ownerCandidateSchema.parse(raw)
    // Also enforced inside the write transaction; no external Bangumi lookup for a non-owner.
    owner(await this.awards.platformActor(actor.id))
    return this.awards.nominate(
      actor,
      id,
      input.title,
      input.studio,
      input.reason,
      { workId: input.workId, subjectId: input.subjectId, coverAssetId: input.coverAssetId },
      input,
    )
  }
  async change(actor: Actor, id: string, candidateId: string, raw: z.input<typeof candidateActionSchema>) {
    const input = candidateActionSchema.parse(raw)
    return this.awards.mutate(actor, id, 'admin', async (campaign, tx, current) => {
      owner(current)
      const all = await this.awards.nominations(id, tx, true),
        entries = all.filter((n) => n.candidateId === candidateId)
      if (!entries.length) throw reject('候选作品不存在或不属于本届。', 404)
      if (revision(entries) !== input.revision) throw reject('作品或提名记录已变化，请刷新后重试。', 409)
      if (input.confirmation !== entries[0]!.title) throw reject('请输入完整作品名称确认操作。', 422)
      const removed = entries.every((n) => !!n.deletedAt)
      if ((input.action === 'remove') === removed) throw reject('候选状态已变化，请刷新。', 409)
      if (
        input.action === 'restore' &&
        all.some(
          (n) => !n.deletedAt && n.candidateId !== candidateId && n.coverRank === entries[0]!.coverRank,
        )
      )
        throw reject('已有相同书库作品的候选，不能重复恢复。', 409)
      const stamp = new Date().toISOString()
      for (const n of entries) {
        if (input.action === 'remove') {
          if (n.deletedAt) continue
          n.deletedAt = stamp
          n.deletedBy = current.id
          n.candidateRemovedAt = stamp
        } else {
          if (n.candidateRemovedAt) {
            delete n.deletedAt
            delete n.deletedBy
            delete n.candidateRemovedAt
          }
        }
        await this.awards.writeNomination(n, tx)
      }
      if (input.action === 'restore' && !entries.some((n) => !n.deletedAt))
        throw reject('这部作品没有整作移除记录，可在提名管理中核对原始记录。', 409)
      if (
        input.action === 'remove' &&
        campaign.phase === 'voting' &&
        campaign.tieBreakGroups?.some((group) => group.candidateIds.includes(candidateId))
      ) {
        const groups = campaign.tieBreakGroups
          .map((group) => ({
            ...group,
            candidateIds: group.candidateIds.filter((value) => value !== candidateId),
          }))
          .filter((group) => group.candidateIds.length >= 2)
        await this.awards.updateMaintenanceGroups(campaign, groups, tx)
      }
      await this.awards.maintenanceAudit(
        current,
        `${input.action === 'remove' ? '移除' : '恢复'}候选作品 ${candidateId}：${entries[0]!.title}；原选票及已公布分数保留`,
        id,
        tx,
      )
      return {
        message:
          input.action === 'remove'
            ? '作品已移出候选列表，原选票与已公布榜单保留。'
            : '作品已恢复，原有候选编号与选票保留。',
      }
    })
  }
}
