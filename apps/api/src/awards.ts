import { notifyUser } from './notifications'
import { Broadcasts } from './broadcasts'
import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import { Database } from './database'
import { Platform, staff, reject, type Actor } from './platform'
import { decode } from './forum'
import {
  phaseNames,
  normalizeWorkTitle,
  validateCampaignSettings,
  validatePhaseTransition,
  campaignWindowMessage,
  ballotRules,
  loveChoices,
  normalizeCampaign,
  normalizeCampaignConfirmation,
  validateWeightedBallot,
  collectAwardCandidates,
  validateBallot,
  tallyAwardResults,
  combineAwardRoundResults,
  awardVotingMode,
  awardVotingCandidates,
  findAwardTieGroups,
  validateTieBreakBallot,
  combineAwardTieBreakResults,
} from './award-rules'
import type {
  AwardCampaign,
  AwardNomination,
  AwardBallot,
  AwardResult,
  CampaignPhase,
  WeightedBallotInput,
  AwardPublicRecommendation,
  AwardAdminBallot,
  AwardVotingMode,
} from './award-types'
import { Catalog } from './catalog'
import { qqNominationRevision, qqNominationSchema } from './qq-nominations'
import { nominationDetailsRevision, nominationDetailsSchema } from './nomination-details'
import type { z } from 'zod'
type Row<T> = { data: T | string; version: number }
type RoundArchive = {
  round: number
  mode?: AwardVotingMode
  phase?: CampaignPhase
  candidateIds?: string[]
  results: AwardResult[]
  ballots: AwardBallot[]
  ballotCount: number
  closedAt: string
}
type StoredResults = { results?: AwardResult[]; ballotCount?: number; rounds?: RoundArchive[] }
export class Awards {
  constructor(
    readonly db: Database,
    private platform: Platform,
    private catalog = new Catalog(db, platform),
  ) {}
  async campaigns(tx?: PoolConnection) {
    return (
      await this.db.rows<Row<AwardCampaign>>(
        "SELECT data,version FROM award_campaigns WHERE JSON_EXTRACT(data,'$.deletedAt') IS NULL ORDER BY edition DESC",
        [],
        tx,
      )
    ).map((r) => normalizeCampaign({ ...decode(r.data), version: r.version }))
  }
  async campaign(id: string, tx?: PoolConnection) {
    const row = (
      await this.db.rows<Row<AwardCampaign>>(
        'SELECT data,version FROM award_campaigns WHERE id=? FOR UPDATE',
        [id],
        tx,
      )
    )[0]
    if (!row || (decode(row.data) as AwardCampaign & { deletedAt?: string }).deletedAt)
      throw reject('活动不存在。', 404)
    return normalizeCampaign({ ...decode(row.data), version: row.version })
  }
  async nominations(id: string, tx?: PoolConnection) {
    return (
      await this.db.rows<Row<AwardNomination>>(
        'SELECT data FROM award_nominations WHERE campaign_id=?',
        [id],
        tx,
      )
    ).map((r) => decode(r.data))
  }
  async ballots(id: string, tx?: PoolConnection) {
    return (
      await this.db.rows<Row<AwardBallot>>('SELECT data FROM award_ballots WHERE campaign_id=?', [id], tx)
    )
      .map((r) => decode(r.data))
      .filter((b) => b.candidateIds.length > 0)
  }
  private async storedResults(id: string, tx?: PoolConnection): Promise<StoredResults> {
    const row = (
      await this.db.rows<Row<StoredResults>>('SELECT data FROM award_results WHERE campaign_id=?', [id], tx)
    )[0]
    return row ? decode(row.data) : {}
  }
  private resultSnapshot(
    c: AwardCampaign,
    stored: StoredResults,
    candidates: ReturnType<typeof collectAwardCandidates>,
    ballots: AwardBallot[],
  ) {
    if (['results', 'archived'].includes(c.phase)) return stored.results || []
    if (c.phase !== 'voting') return []
    const tieBreak = awardVotingMode(c) === 'tie-break'
    const live = tallyAwardResults(
      tieBreak ? awardVotingCandidates(c, candidates) : candidates,
      tieBreak
        ? ballots.filter((ballot) => !validateTieBreakBallot(ballot.candidateIds, c.tieBreakGroups || []))
        : ballots,
      c.id,
      tieBreak ? 'legacy' : c.votingRule,
      ballotRules(c),
    )
    if (tieBreak)
      return combineAwardTieBreakResults(
        stored.results || [],
        live,
        c.tieBreakGroups || [],
        c.votingRound || 1,
      )
    return stored.rounds?.[0] ? combineAwardRoundResults(stored.rounds[0].results, live) : live
  }
  async state(id: string, actor?: Actor) {
    return this.db.transaction(async (tx) => {
      const campaign = await this.campaign(id, tx),
        nominations = await this.nominations(id, tx)
      const isStaff = !!actor && actor.role !== 'member',
        ended = ['results', 'archived'].includes(campaign.phase)
      const round = campaign.votingRound || 1,
        stored = await this.storedResults(id, tx)
      const current = await this.ballots(id, tx),
        candidates = collectAwardCandidates(nominations, id)
      const results = this.resultSnapshot(campaign, stored, candidates, current)
      const mine = actor
        ? (
            await this.db.rows<Row<AwardBallot>>(
              'SELECT data,version FROM award_ballots WHERE campaign_id=? AND user_id=?',
              [id, actor.id],
              tx,
            )
          )[0]
        : undefined
      const allBallots = isStaff
        ? (
            await this.db.rows<Row<AwardBallot>>(
              'SELECT data FROM award_ballots WHERE campaign_id=?',
              [id],
              tx,
            )
          ).map((row) => decode(row.data))
        : current
      const roundBallots = [
        ...(stored.rounds || []).flatMap((previous) =>
          previous.ballots.map((ballot) => ({
            ...ballot,
            round: previous.round,
            mode: previous.mode || ((previous.round === 1 ? 'standard' : 'supplementary') as AwardVotingMode),
            eligibleCandidateIds: previous.candidateIds,
          })),
        ),
        ...allBallots.map((ballot) => ({
          ...ballot,
          round,
          mode: awardVotingMode(campaign),
          eligibleCandidateIds: awardVotingCandidates(campaign, candidates).map((item) => item.id),
        })),
      ]
      const ids = [...new Set(roundBallots.map((ballot) => ballot.accountId))]
      const users = ids.length
        ? await this.db.rows<{ id: string; nickname: string; status: string }>(
            'SELECT id,nickname,status FROM users WHERE id IN (' + ids.map(() => '?').join(',') + ')',
            ids,
            tx,
          )
        : []
      const names = new Map(
        users.map((user) => [user.id, user.status === 'deleted' ? '已注销用户' : user.nickname]),
      )
      const currentNominations = new Map(nominations.map((item) => [item.id, item]))
      const sanitize = (n: AwardNomination) => {
        const latest = currentNominations.get(n.id) || n
        // Only presentation metadata changes; historical scores and original submissions stay intact.
        const displayed = { ...n, qqSync: latest.qqSync, displayOverride: latest.displayOverride }
        if (isStaff)
          return {
            ...displayed,
            detailsRevision: nominationDetailsRevision(latest),
            ...(campaign.edition === 2 ? { qqSyncRevision: qqNominationRevision(latest) } : {}),
          }
        return n.accountId === actor?.id
          ? displayed
          : { ...displayed, accountId: '', reviewedBy: undefined, reviewNote: undefined }
      }
      const recommendations: AwardPublicRecommendation[] =
        campaign.votingRule === 'weighted-v1'
          ? roundBallots.flatMap((ballot) => {
              if (ballot.mode === 'tie-break') return []
              const pool = ballot.eligibleCandidateIds
                ? candidates.filter((candidate) => ballot.eligibleCandidateIds!.includes(candidate.id))
                : ballot.round === 2
                  ? candidates.filter((candidate) => !campaign.lockedCandidateIds?.includes(candidate.id))
                  : candidates
              if (
                validateWeightedBallot(
                  {
                    loveIds: ballot.loveIds,
                    loveId: ballot.loveId || null,
                    likeIds: ballot.likeIds || [],
                    recommendations: ballot.recommendations || [],
                  },
                  pool,
                  ballotRules(campaign),
                )
              )
                return []
              return (ballot.recommendations || []).map((item) => ({
                ...item,
                authorName: names.get(ballot.accountId) || '已注销用户',
                round: ballot.round,
              }))
            })
          : []
      const ballots: AwardAdminBallot[] = isStaff
        ? roundBallots.map(({ eligibleCandidateIds: _eligibleCandidateIds, ...ballot }) => ({
            ...ballot,
            accountName: names.get(ballot.accountId) || '已注销用户',
          }))
        : []
      return {
        campaign,
        campaigns: await this.campaigns(tx),
        nominations: nominations
          .filter(
            (n) => isStaff || n.status === 'approved' || n.status === 'pending' || n.accountId === actor?.id,
          )
          .map(sanitize),
        myBallot:
          mine && decode(mine.data).candidateIds.length
            ? { ...decode(mine.data), version: mine.version }
            : null,
        ballotVersion: mine?.version || 0,
        results: results.map((result) => ({ ...result, nominations: result.nominations.map(sanitize) })),
        ballotCount: ended
          ? stored.ballotCount || 0
          : current.length + (stored.rounds || []).reduce((sum, previous) => sum + previous.ballotCount, 0),
        recommendations,
        ...(isStaff ? { ballots, rounds: stored.rounds || [] } : {}),
        audit: isStaff
          ? await this.db.rows(
              'SELECT id,campaign_id AS campaignId,actor,action,created_at AS createdAt FROM audit_logs WHERE campaign_id=? ORDER BY created_at DESC',
              [id],
              tx,
            )
          : [],
      }
    })
  }
  async mutate<T>(
    actor: Actor,
    id: string,
    permission: 'member' | 'admin',
    run: (campaign: AwardCampaign, tx: PoolConnection, current: Actor) => Promise<T>,
  ) {
    return this.db.transaction(async (tx) => {
      await this.platform.lock(`account:${actor.id}`, tx)
      await this.platform.lock(`campaign:${id}`, tx)
      const current = await this.platform.actor(actor.id, tx)
      if (permission === 'admin') staff(current)
      return run(await this.campaign(id, tx), tx, current)
    })
  }
  async create(actor: Actor, input: { edition?: number } = {}) {
    staff(actor)
    return this.db.transaction(async (tx) => {
      await this.platform.lock(`account:${actor.id}`, tx)
      await this.platform.lock('campaign-editions', tx)
      staff(await this.platform.actor(actor.id, tx))
      let edition: number
      if (input.edition != null) {
        edition = input.edition
        const occupied = await this.db.rows<{ id: string; data: unknown }>(
          'SELECT id,data FROM award_campaigns WHERE edition=? FOR UPDATE',
          [edition],
          tx,
        )
        if (occupied.length) {
          const archived = !!(decode(occupied[0]!.data) as AwardCampaign & { deletedAt?: string }).deletedAt
          if (!archived) throw reject(`第 ${edition} 届已存在，请换一个届数。`, 422)
          await this.db.execute('DELETE FROM award_nominations WHERE campaign_id=?', [occupied[0]!.id], tx)
          await this.db.execute('DELETE FROM award_ballots WHERE campaign_id=?', [occupied[0]!.id], tx)
          await this.db.execute('DELETE FROM award_results WHERE campaign_id=?', [occupied[0]!.id], tx)
          await this.db.execute('DELETE FROM award_candidates WHERE campaign_id=?', [occupied[0]!.id], tx)
          await this.db.execute('DELETE FROM award_campaigns WHERE id=?', [occupied[0]!.id], tx)
          await this.platform.audit(actor, `回收已删除的第 ${edition} 届档案`, occupied[0]!.id, tx)
        }
      } else {
        edition = Number(
          (
            await this.db.rows<{ edition: number }>(
              'SELECT COALESCE(MAX(edition),1)+1 edition FROM award_campaigns',
              [],
              tx,
            )
          )[0]!.edition,
        )
      }
      const campaign: AwardCampaign = {
        id: randomUUID(),
        edition,
        title: `第 ${edition} 届澄之响十二橙器`,
        phase: 'draft',
        nominationLimit: 3,
        voteLimit: 3,
        votingRule: 'weighted-v1',
        winnerCount: 12,
        nominationStart: null,
        nominationEnd: null,
        votingStart: null,
        votingEnd: null,
        createdAt: new Date().toISOString(),
        version: 0,
      }
      await this.db.execute(
        'INSERT INTO award_campaigns(id,edition,data) VALUES (?,?,?)',
        [campaign.id, edition, JSON.stringify(campaign)],
        tx,
      )
      await this.platform.audit(actor, '创建新一届活动', campaign.id, tx)
      return campaign
    })
  }
  async settings(actor: Actor, id: string, next: AwardCampaign) {
    return this.mutate(actor, id, 'admin', async (c, tx, current) => {
      if (c.version !== next.version) throw reject('活动已被其他管理员修改，请刷新。')
      const rule = next.votingRule ?? c.votingRule
      if (c.phase !== 'draft' && rule !== c.votingRule) throw reject('活动开放后计分规则已锁定。')
      if (
        c.phase !== 'draft' &&
        (['nominationLimit', 'voteLimit', 'winnerCount'] as const).some((k) => c[k] !== next[k])
      )
        throw reject('活动开放后名额规则已锁定。')
      if (
        ['results', 'archived'].includes(c.phase) &&
        (['nominationStart', 'nominationEnd', 'votingStart', 'votingEnd'] as const).some(
          (k) => c[k] !== next[k],
        )
      )
        throw reject('结果公布后时间已锁定。')
      if (c.phase !== 'draft' && JSON.stringify(ballotRules(c)) !== JSON.stringify(ballotRules(next)))
        throw reject('活动开放后计分规则已锁定。')
      const safe = {
        ...next,
        votingRule: rule,
        id: c.id,
        edition: c.edition,
        phase: c.phase,
        votingRound: c.votingRound,
        votingMode: c.votingMode,
        tieBreakGroups: c.tieBreakGroups,
        lockedCandidateIds: c.lockedCandidateIds,
        createdAt: c.createdAt,
        version: c.version! + 1,
      }
      const error = validateCampaignSettings(safe)
      if (error) throw reject(error, 422)
      await this.db.execute(
        'UPDATE award_campaigns SET data=?,version=version+1 WHERE id=?',
        [JSON.stringify(safe), id],
        tx,
      )
      await this.platform.audit(current, '修改活动设置', id, tx)
    })
  }
  async remove(actor: Actor, id: string, version: number, confirmation: string) {
    return this.mutate(actor, id, 'admin', async (c, tx, current) => {
      if (c.version !== version) throw reject('活动已更新，请刷新后再删除。')
      if (normalizeCampaignConfirmation(confirmation) !== normalizeCampaignConfirmation(c.title))
        throw reject('请输入完整活动名称确认删除。', 422)
      await this.db.execute(
        'UPDATE award_campaigns SET data=?,version=version+1 WHERE id=?',
        [JSON.stringify({ ...c, deletedAt: new Date().toISOString(), version: c.version! + 1 }), id],
        tx,
      )
      await this.platform.audit(current, '删除活动：' + c.title, id, tx)
      return { message: '活动已删除。' }
    })
  }
  async phase(actor: Actor, id: string, to: CampaignPhase, version: number) {
    return this.mutate(actor, id, 'admin', async (c, tx, current) => {
      if (version !== c.version) throw reject('活动状态已更新，请刷新。')
      const nominations = await this.nominations(id, tx),
        candidates = collectAwardCandidates(nominations, id)
      const error = validatePhaseTransition(
        c.phase,
        to,
        nominations.filter((n) => n.status === 'pending').length,
        candidates.length,
      )
      if (error) throw reject(error)
      if (to === 'results' || to === 'archived') {
        const ballots = to === 'results' ? await this.ballots(id, tx) : [],
          stored = await this.storedResults(id, tx)
        const results = this.resultSnapshot(c, stored, candidates, ballots)
        if (findAwardTieGroups(results).length)
          throw reject('存在尚未分出位次的同票作品，请开启同票加赛，直至名次唯一后再公布或归档。', 409)
        const supplementary =
          awardVotingMode(c) === 'supplementary' ||
          stored.rounds?.some(
            (item) => item.mode === 'supplementary' || item.phase === 'results' || item.phase === 'archived',
          )
        if (
          to === 'results' &&
          !supplementary &&
          results.filter((item) => item.votes > 0).length < c.winnerCount
        )
          throw reject(
            '有效得分作品不足计划名额，请先开启二次投票，保留首轮已得分作品并补投其余提名作品。',
            409,
          )
        const result = {
          ...stored,
          results,
          ballotCount:
            ballots.length + (stored.rounds || []).reduce((sum, item) => sum + item.ballotCount, 0),
        }
        if (to === 'results')
          await this.db.execute(
            'INSERT INTO award_results(campaign_id,data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
            [id, JSON.stringify(result)],
            tx,
          )
      }
      await this.db.execute(
        'UPDATE award_campaigns SET data=?,version=version+1 WHERE id=?',
        [JSON.stringify({ ...c, phase: to, version: c.version! + 1 }), id],
        tx,
      )
      await this.platform.audit(current, `推进阶段：${phaseNames[to]}`, id, tx)
      const announcements: Partial<Record<CampaignPhase, { action: string; content: string }>> = {
        nomination: {
          action: '开放提名',
          content: `${c.title}已进入${phaseNames.nomination}，欢迎参与！\n具体开放时间和参与规则请查看活动页。`,
        },
        voting: {
          action: '开放投票',
          content: `${c.title}已进入${phaseNames.voting}，欢迎参与！\n具体开放时间和参与规则请查看活动页。`,
        },
        results: {
          action: '结果公布',
          content: `${c.title}的投票结果已公布。欢迎查看本届入选作品、最终名次与成员推荐词。`,
        },
        archived: {
          action: '本届已归档',
          content: `${c.title}已归档，设置与结果保持只读。欢迎翻开本届评选档案，重温共同喜欢的故事。`,
        },
      }
      const announcement = announcements[to]
      if (announcement) {
        await new Broadcasts(this.db, this.platform).deliver(
          current,
          `award:${id}:${to}${awardVotingMode(c) === 'tie-break' ? ':round:' + (c.votingRound || 1) : ''}`,
          'activity',
          `${c.title} · ${announcement.action}`,
          announcement.content,
          '/awards?campaign=' + encodeURIComponent(id),
          tx,
        )
      }
    })
  }
  window(c: AwardCampaign, phase: 'nomination' | 'voting') {
    if (c.phase !== phase) throw reject('当前阶段不允许此操作。')
    const error = campaignWindowMessage(c, phase)
    if (error) throw reject(error)
  }
  async startRunoff(actor: Actor, id: string, version: number) {
    return this.mutate(actor, id, 'admin', async (c, tx, current) => {
      if (c.version !== version) throw reject('活动状态已更新，请刷新。', 409)
      if (c.phase !== 'voting' || (c.votingRound || 1) !== 1)
        throw reject('仅首轮投票阶段可以开启二次投票。', 409)
      const candidates = collectAwardCandidates(await this.nominations(id, tx), id)
      const ballots = await this.ballots(id, tx)
      const results = tallyAwardResults(candidates, ballots, id, c.votingRule, ballotRules(c))
      const locked = results.filter((item) => item.votes > 0).map((item) => item.id)
      if (locked.length >= c.winnerCount) throw reject('首轮有效得分作品已达到计划名额，无需二次投票。', 409)
      const archived: StoredResults = {
        rounds: [
          {
            round: 1,
            mode: 'standard',
            phase: c.phase,
            candidateIds: candidates.map((item) => item.id),
            results,
            ballots: (
              await this.db.rows<Row<AwardBallot>>(
                'SELECT data FROM award_ballots WHERE campaign_id=?',
                [id],
                tx,
              )
            ).map((row) => decode(row.data)),
            ballotCount: ballots.length,
            closedAt: new Date().toISOString(),
          },
        ],
      }
      await this.db.execute(
        'INSERT INTO award_results(campaign_id,data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
        [id, JSON.stringify(archived)],
        tx,
      )
      await this.db.execute('DELETE FROM award_ballots WHERE campaign_id=?', [id], tx)
      await this.db.execute(
        'UPDATE award_campaigns SET data=?,version=version+1 WHERE id=?',
        [
          JSON.stringify({
            ...c,
            votingRound: 2,
            votingMode: 'supplementary',
            lockedCandidateIds: locked,
            votingStart: null,
            votingEnd: null,
            version: c.version! + 1,
          }),
          id,
        ],
        tx,
      )
      await this.platform.audit(current, '开启二次投票，保留首轮 ' + locked.length + ' 部已得分作品', id, tx)
      await new Broadcasts(this.db, this.platform).deliver(
        current,
        'award:' + id + ':runoff',
        'activity',
        c.title + ' · 二次投票',
        '首轮已得分作品保留，请为其余已提名作品补投，补足入选名额。',
        '/awards?campaign=' + encodeURIComponent(id),
        tx,
      )
    })
  }
  async startTieBreak(actor: Actor, id: string, version: number) {
    return this.mutate(actor, id, 'admin', async (c, tx, current) => {
      if (c.version !== version) throw reject('活动状态已更新，请刷新。', 409)
      if (!['voting', 'results', 'archived'].includes(c.phase))
        throw reject('仅投票、公布或归档后的同票结果可以开启加赛。', 409)
      const candidates = collectAwardCandidates(await this.nominations(id, tx), id)
      const ballots = await this.ballots(id, tx)
      const stored = await this.storedResults(id, tx)
      const results = this.resultSnapshot(c, stored, candidates, ballots)
      const groups = findAwardTieGroups(results)
      if (!groups.length) throw reject('当前没有需要加赛的同票作品。', 409)
      if (
        c.phase === 'voting' &&
        awardVotingMode(c) === 'standard' &&
        results.filter((item) => item.votes > 0).length < c.winnerCount
      )
        throw reject('有效得分作品不足计划名额，请先开启二次投票补足名单，再处理同票加赛。', 409)
      const round = c.votingRound || 1
      const nextRound = round + 1
      const history: RoundArchive = {
        round,
        mode: awardVotingMode(c),
        phase: c.phase,
        results,
        candidateIds: awardVotingCandidates(c, candidates).map((item) => item.id),
        ballots: (
          await this.db.rows<Row<AwardBallot>>('SELECT data FROM award_ballots WHERE campaign_id=?', [id], tx)
        ).map((row) => decode(row.data)),
        ballotCount: ballots.length,
        closedAt: new Date().toISOString(),
      }
      const rounds = [...(stored.rounds || []), history]
      await this.db.execute(
        'INSERT INTO award_results(campaign_id,data) VALUES (?,?) ON DUPLICATE KEY UPDATE data=VALUES(data)',
        [
          id,
          JSON.stringify({
            ...stored,
            results,
            rounds,
            ballotCount: rounds.reduce((sum, item) => sum + item.ballotCount, 0),
          }),
        ],
        tx,
      )
      await this.db.execute('DELETE FROM award_ballots WHERE campaign_id=?', [id], tx)
      await this.db.execute(
        'UPDATE award_campaigns SET data=?,version=version+1 WHERE id=?',
        [
          JSON.stringify({
            ...c,
            phase: 'voting',
            votingMode: 'tie-break',
            votingRound: nextRound,
            tieBreakGroups: groups,
            votingStart: null,
            votingEnd: null,
            version: c.version! + 1,
          }),
          id,
        ],
        tx,
      )
      await this.platform.audit(current, `开启第 ${nextRound} 轮同票加赛，共 ${groups.length} 组`, id, tx)
      await new Broadcasts(this.db, this.platform).deliver(
        current,
        `award:${id}:tie-break:${nextRound}`,
        'activity',
        `${c.title} · 第 ${nextRound} 轮同票加赛`,
        '同票作品重新投票，每组每人最多选择一部作品；仅决定组内名次，其他名次和原始得分保留。若仍同票，将继续加赛直至分出位次。',
        '/awards?campaign=' + encodeURIComponent(id),
        tx,
      )
    })
  }
  async nominate(
    actor: Actor,
    id: string,
    title: string,
    studio: string,
    reason: string,
    source: { workId?: number; subjectId?: number; coverAssetId?: string } = {},
  ) {
    await this.platform.actor(actor.id)
    if (source.workId && source.subjectId) throw reject('请选择一种作品来源。', 422)
    if (source.coverAssetId && (source.workId || source.subjectId))
      throw reject('自选封面仅用于手动添加新作品。', 422)
    const subject = source.subjectId ? await this.catalog.bangumi.detail(source.subjectId, true) : undefined
    return this.mutate(actor, id, 'member', async (c, tx, current) => {
      this.window(c, 'nomination')
      const known = await this.catalog.nominationWork(current, tx, {
        title,
        studio,
        workId: source.workId,
        subject,
        coverAssetId: source.coverAssetId,
      })
      const normalized = normalizeWorkTitle(known.title)
      if (!normalized) throw reject('作品名称无效。', 422)
      const nominations = await this.nominations(id, tx),
        mine = nominations.filter(
          (n) => n.accountId === actor.id && !['withdrawn', 'rejected'].includes(n.status),
        )
      if (current.role !== 'super_admin' && mine.length >= c.nominationLimit)
        throw reject('已达到本届提名上限。')
      if (
        current.role !== 'super_admin' &&
        mine.some((n) => n.coverRank === known.rank || normalizeWorkTitle(n.title) === normalized)
      )
        throw reject('你已提名过这部作品，同一用户不能重复提交。', 409)
      const previous = nominations.find((n) => n.coverRank === known.rank)
      let candidate = previous
        ? { id: previous.candidateId }
        : (
            await this.db.rows<{ id: string }>(
              'SELECT id FROM award_candidates WHERE campaign_id=? AND normalized_title=?',
              [id, normalized],
              tx,
            )
          )[0]
      if (!candidate) {
        candidate = { id: randomUUID() }
        await this.db.execute(
          'INSERT INTO award_candidates(id,campaign_id,normalized_title,data) VALUES (?,?,?,?)',
          [
            candidate.id,
            id,
            normalized,
            JSON.stringify({
              title: known.title,
              studio: known.studio,
              coverRank: known.rank,
            }),
          ],
          tx,
        )
      }
      const n: AwardNomination = {
        id: randomUUID(),
        campaignId: id,
        candidateId: candidate.id,
        title: known.title,
        studio: known.studio,
        coverRank: known.rank,
        reason,
        accountId: actor.id,
        accountName: current.nickname,
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      await this.db.execute(
        'INSERT INTO award_nominations(id,campaign_id,candidate_id,user_id,status,data) VALUES (?,?,?,?,?,?)',
        [n.id, id, candidate.id, actor.id, n.status, JSON.stringify(n)],
        tx,
      )
      await this.platform.audit(current, '提交作品提名', id, tx)
      return { id: n.id }
    })
  }
  async editNominationDetails(actor: Actor, id: string, input: z.infer<typeof nominationDetailsSchema>) {
    return this.mutate(actor, id, 'admin', async (_campaign, tx, current) => {
      const nominations = new Map((await this.nominations(id, tx)).map((item) => [item.id, item]))
      const updates = input.entries.map((entry) => {
        const nomination = nominations.get(entry.id)
        if (!nomination) throw reject('提名不存在或不属于当前活动。', 404)
        if (nominationDetailsRevision(nomination) !== entry.revision)
          throw reject('提名信息已被修改，请刷新记录后重新编辑；本次未保存任何修改。', 409)
        return { entry, nomination }
      })
      for (const { entry, nomination } of updates) {
        const previous = nomination.displayOverride || {
          nominatorName: nomination.qqSync?.nominatorName || nomination.accountName,
          nominatedAt: nomination.qqSync?.nominatedAt || nomination.createdAt,
          reason: nomination.reason,
        }
        nomination.displayOverride = {
          nominatorName: entry.nominatorName,
          nominatedAt: new Date(entry.nominatedAt).toISOString(),
          reason: entry.reason,
        }
        await this.db.execute(
          'UPDATE award_nominations SET data=? WHERE id=? AND campaign_id=?',
          [JSON.stringify(nomination), nomination.id, id],
          tx,
        )
        await this.platform.audit(
          current,
          `编辑提名展示 ${nomination.id}：${previous.nominatorName} → ${entry.nominatorName}；更新${
            [
              previous.nominatorName !== entry.nominatorName ? '姓名' : '',
              previous.nominatedAt !== nomination.displayOverride.nominatedAt ? '时间' : '',
              previous.reason !== entry.reason ? '提名词' : '',
            ]
              .filter(Boolean)
              .join('、') || '展示信息'
          }`,
          id,
          tx,
        )
      }
      return { message: `已保存 ${updates.length} 条提名信息。` }
    })
  }
  async syncQqNomination(
    actor: Actor,
    id: string,
    nominationId: string,
    input: z.infer<typeof qqNominationSchema>,
  ) {
    return this.mutate(actor, id, 'admin', async (campaign, tx, current) => {
      if (campaign.edition !== 2) throw reject('QQ群提名临时同步仅限第二届活动。', 403)
      const nomination = (await this.nominations(id, tx)).find((item) => item.id === nominationId)
      if (!nomination) throw reject('提名不存在或不属于当前活动。', 404)
      if (qqNominationRevision(nomination) !== input.revision)
        throw reject('提名信息已被修改，请刷新后重新同步。', 409)
      const previous = nomination.qqSync || {
        nominatorName: nomination.accountName,
        nominatedAt: nomination.createdAt,
      }
      nomination.qqSync = {
        nominatorName: input.nominatorName,
        nominatedAt: new Date(input.nominatedAt).toISOString(),
      }
      if (nomination.displayOverride)
        nomination.displayOverride = { ...nomination.displayOverride, ...nomination.qqSync }
      await this.db.execute(
        'UPDATE award_nominations SET data=? WHERE id=? AND campaign_id=?',
        [JSON.stringify(nomination), nomination.id, id],
        tx,
      )
      await this.platform.audit(
        current,
        `第二届QQ群提名同步 ${nomination.id}：${previous.nominatorName}（${previous.nominatedAt}）→${nomination.qqSync.nominatorName}（${nomination.qqSync.nominatedAt}）`,
        id,
        tx,
      )
      return { message: '第二届QQ群提名信息已同步。' }
    })
  }
  async nominationAction(
    actor: Actor,
    id: string,
    nominationId: string,
    action: 'withdrawn' | 'approved' | 'rejected',
    note = '',
  ) {
    return this.mutate(actor, id, action === 'withdrawn' ? 'member' : 'admin', async (c, tx) => {
      if (action === 'withdrawn') this.window(c, 'nomination')
      else if (c.phase !== 'nomination') throw reject('仅可在提名阶段审核。')
      const n = (await this.nominations(id, tx)).find((n) => n.id === nominationId)
      if (!n) throw reject('提名不存在。', 404)
      if (action === 'withdrawn') {
        if (n.accountId !== actor.id) throw reject('只能撤回本人提名。', 403)
      } else if (n.status !== 'pending') throw reject('这条提名已经处理。')
      if (action === 'rejected' && !note.trim()) throw reject('退回时必须填写原因。', 422)
      n.status = action
      n.reviewNote = note
      if (action !== 'withdrawn') n.reviewedBy = actor.nickname
      await this.db.execute(
        'UPDATE award_nominations SET status=?,data=? WHERE id=?',
        [action, JSON.stringify(n), n.id],
        tx,
      )
      await this.platform.audit(
        actor,
        `处理提名：${action === 'approved' ? '通过' : action === 'rejected' ? '退回' : '撤回'}`,
        id,
        tx,
      )
      if (action !== 'withdrawn')
        await notifyUser(
          this.db,
          n.accountId,
          'nomination',
          n.title + (action === 'approved' ? ' 的提名已通过审核。' : ' 的提名已退回，请查看审核原因。'),
          '/awards?campaign=' + id,
          tx,
        )
    })
  }
  async vote(
    actor: Actor,
    id: string,
    ids: string[] | null,
    version: number,
    weighted?: WeightedBallotInput,
    round = 1,
  ) {
    return this.mutate(actor, id, 'member', async (c, tx) => {
      this.window(c, 'voting')
      if (round !== (c.votingRound || 1)) throw reject('投票轮次已更新，请刷新后重新填写本轮选票。', 409)
      const available = awardVotingCandidates(c, collectAwardCandidates(await this.nominations(id, tx), id))
      const tieBreak = awardVotingMode(c) === 'tie-break'
      const existing = (
        await this.db.rows<Row<AwardBallot>>(
          'SELECT data,version FROM award_ballots WHERE campaign_id=? AND user_id=?',
          [id, actor.id],
          tx,
        )
      )[0]
      if ((existing?.version || 0) !== version) throw reject('选票已在其他页面修改，请刷新。')
      {
        if (ids !== null) {
          const error = tieBreak
            ? validateTieBreakBallot(ids, c.tieBreakGroups || [])
            : validateBallot(ids, available, c.voteLimit)
          if (error) throw reject(error, 422)
          if (tieBreak) {
            if (weighted) throw reject('同票加赛每组一票，不使用真爱票、喜爱票或推荐词加分。', 422)
          } else if (c.votingRule === 'weighted-v1') {
            if (!weighted) throw reject('请按真爱票和喜爱票重新填写选票。', 422)
            const problem = validateWeightedBallot(weighted, available, ballotRules(c))
            if (problem) throw reject(problem, 422)
            const chosen = [...loveChoices(weighted), ...weighted.likeIds]
            if (JSON.stringify([...ids].sort()) !== JSON.stringify([...chosen].sort()))
              throw reject('选票作品与票种不一致。', 422)
          } else if (weighted) throw reject('本届使用原计票规则。', 422)
        }
        const ballot: AwardBallot = {
          id: existing ? decode(existing.data).id : randomUUID(),
          campaignId: id,
          accountId: actor.id,
          candidateIds: ids || [],
          ...(ids && !tieBreak && c.votingRule === 'weighted-v1' ? weighted : {}),
          updatedAt: new Date().toISOString(),
        }
        await this.db.execute(
          'INSERT INTO award_ballots(id,campaign_id,user_id,data) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),version=version+1',
          [ballot.id, id, actor.id, JSON.stringify(ballot)],
          tx,
        )
      }
      await this.platform.audit(actor, ids ? '提交或修改选票' : '撤回选票', id, tx)
    })
  }
}
