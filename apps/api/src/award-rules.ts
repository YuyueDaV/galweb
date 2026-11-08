// Generated from packages/domain by scripts/sync-award-rules.mjs. Do not edit.
import type {
  AwardBallotRules,
  AwardVotingRule,
  WeightedBallotInput,
  AccountRole,
  AwardPermission,
  AwardCampaign,
  AwardNomination,
  AwardCandidate,
  AwardBallot,
  AwardResult,
  CampaignPhase,
} from './award-types'

export const roleNames: Record<AccountRole, string> = {
  member: '普通成员',
  admin: '管理员',
  super_admin: '超级管理员',
}
export const phaseNames: Record<CampaignPhase, string> = {
  draft: '筹备中',
  nomination: '提名阶段',
  voting: '投票阶段',
  results: '结果公布',
  archived: '已归档',
}
export const permissionLabels: Record<AwardPermission, string> = {
  'nomination.submit': '提交与撤回本人提名',
  'ballot.submit': '提交与修改本人选票',
  'campaign.manage': '配置名额、时间与推进阶段',
  'nomination.review': '审核提名与推荐语',
  'campaign.create': '创建新一届活动',
  'campaign.archive': '归档活动结果',
  'campaign.delete': '删除活动',
  'account.view': '查看账号与角色',
  'account.status': '启用与禁用账号',
  'account.manage': '分配管理员权限',
}
const memberPermissions: AwardPermission[] = ['nomination.submit', 'ballot.submit']
const adminPermissions: AwardPermission[] = [
  ...memberPermissions,
  'campaign.manage',
  'nomination.review',
  'campaign.create',
  'campaign.archive',
  'campaign.delete',
]
export function hasAwardPermission(role: AccountRole, permission: AwardPermission) {
  return (
    role === 'super_admin' || (role === 'admin' ? adminPermissions : memberPermissions).includes(permission)
  )
}

export function isStaffRole(role: string) {
  return role === 'admin' || role === 'super_admin'
}

export function isOwnerRole(role: string) {
  return role === 'super_admin'
}

export const DEFAULT_BALLOT_RULES: AwardBallotRules = {
  loveLimit: 1,
  likeLimit: 2,
  lovePoints: 2,
  likePoints: 1,
  recommendationPoints: 2,
  recommendationLimit: 3,
}
export function ballotRules(campaign: AwardCampaign): AwardBallotRules {
  return campaign.ballotRules || { ...DEFAULT_BALLOT_RULES }
}
export function loveChoices(input: Pick<WeightedBallotInput, 'loveId' | 'loveIds'>) {
  return input.loveIds ?? (input.loveId ? [input.loveId] : [])
}
export function validateBallotRules(rules: AwardBallotRules) {
  for (const key of ['loveLimit', 'likeLimit'] as const)
    if (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > 10)
      return '每种票数需为 0–10 的整数。'
  if (rules.loveLimit + rules.likeLimit < 1) return '至少需要开放一种选票。'
  for (const key of ['lovePoints', 'likePoints', 'recommendationPoints'] as const)
    if (!Number.isInteger(rules[key]) || rules[key] < 0 || rules[key] > 100) return '分值需为 0–100 的整数。'
  if (
    !Number.isInteger(rules.recommendationLimit) ||
    rules.recommendationLimit < 0 ||
    rules.recommendationLimit > rules.loveLimit + rules.likeLimit
  )
    return '推荐词份数上限不能超过可投作品数。'
  return ''
}
export function campaignVotingRule(campaign: AwardCampaign): AwardVotingRule {
  return campaign.votingRule || (campaign.phase === 'draft' ? 'weighted-v1' : 'legacy')
}
export function normalizeCampaign(campaign: AwardCampaign): AwardCampaign {
  const votingRule = campaignVotingRule(campaign)
  return {
    ...campaign,
    votingRule,
    ...(votingRule === 'weighted-v1' ? { ballotRules: ballotRules(campaign) } : {}),
    voteLimit:
      votingRule === 'weighted-v1'
        ? ballotRules(campaign).loveLimit + ballotRules(campaign).likeLimit
        : campaign.voteLimit,
  }
}
export function validateWeightedBallot(
  input: WeightedBallotInput,
  candidates: AwardCandidate[],
  rules: AwardBallotRules = DEFAULT_BALLOT_RULES,
) {
  const love = loveChoices(input)
  if (love.length > rules.loveLimit) return '真爱票超过本届上限。'
  if (input.likeIds.length > rules.likeLimit) return '喜爱票超过本届上限。'
  const ids = [...love, ...input.likeIds]
  const error = validateBallot(ids, candidates, rules.loveLimit + rules.likeLimit)
  if (error) return error
  if (input.recommendations.length > rules.recommendationLimit) return '推荐词超过本届份数上限。'
  const seen = new Set<string>()
  for (const item of input.recommendations) {
    if (!ids.includes(item.candidateId)) return '推荐词只能写给自己投票的作品。'
    if (seen.has(item.candidateId)) return '每个作品只能提交一份推荐词。'
    seen.add(item.candidateId)
    if (!item.text.trim() || item.text.trim().length > 600) return '推荐词需为 1–600 个字符。'
  }
  return ''
}
export function normalizeWorkTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, '')
}

export function validateCampaignSettings(campaign: AwardCampaign) {
  if (campaign.votingRule === 'weighted-v1') {
    const error = validateBallotRules(ballotRules(campaign))
    if (error) return error
    if (campaign.voteLimit !== ballotRules(campaign).loveLimit + ballotRules(campaign).likeLimit)
      return '总票数与票种配置不一致。'
  }
  if (!campaign.title.trim() || campaign.title.length > 80) return '活动名称需为 1–80 个字。'
  for (const [name, value] of [
    ['每人提名数', campaign.nominationLimit],
    ['每人票数', campaign.voteLimit],
    ['入选名额', campaign.winnerCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 100) return `${name}需为 1–100 的整数。`
  }
  const pairs = [
    [campaign.nominationStart, campaign.nominationEnd, '提名'],
    [campaign.votingStart, campaign.votingEnd, '投票'],
  ] as const
  for (const [start, end, label] of pairs) {
    if (Boolean(start) !== Boolean(end)) return `请同时填写${label}开始与结束时间，或同时留空。`
    if (
      start &&
      end &&
      (!Number.isFinite(Date.parse(start)) ||
        !Number.isFinite(Date.parse(end)) ||
        Date.parse(start) >= Date.parse(end))
    )
      return `${label}结束时间必须晚于开始时间。`
  }
  if (
    campaign.nominationEnd &&
    campaign.votingStart &&
    Date.parse(campaign.votingStart) < Date.parse(campaign.nominationEnd)
  )
    return '投票开始时间不能早于提名结束时间。'
  return ''
}

export function campaignWindowMessage(
  campaign: AwardCampaign,
  phase: 'nomination' | 'voting',
  now = Date.now(),
) {
  const start = phase === 'nomination' ? campaign.nominationStart : campaign.votingStart
  const end = phase === 'nomination' ? campaign.nominationEnd : campaign.votingEnd
  const label = phase === 'nomination' ? '提名' : '投票'
  if (start && now < Date.parse(start)) return `${label}时间尚未开始。`
  if (end && now >= Date.parse(end)) return `${label}时间已结束。`
  return ''
}

export function collectAwardCandidates(nominations: AwardNomination[], campaignId: string): AwardCandidate[] {
  const grouped = new Map<string, AwardCandidate>()
  for (const item of nominations) {
    if (item.campaignId !== campaignId || item.status !== 'approved') continue
    const existing = grouped.get(item.candidateId)
    if (existing) existing.nominations.push(item)
    else
      grouped.set(item.candidateId, {
        id: item.candidateId,
        title: item.title,
        studio: item.studio,
        coverRank: item.coverRank,
        nominations: [item],
      })
  }
  return [...grouped.values()].sort(
    (a, b) => b.nominations.length - a.nominations.length || a.title.localeCompare(b.title, 'zh-CN'),
  )
}

export function validateBallot(candidateIds: string[], candidates: AwardCandidate[], limit: number) {
  if (!candidateIds.length) return '请至少选择一部作品。'
  if (new Set(candidateIds).size !== candidateIds.length) return '同一部作品只能获得你的一票。'
  if (candidateIds.length > limit) return `本届每人最多选择 ${limit} 部作品。`
  const available = new Set(candidates.map((candidate) => candidate.id))
  if (candidateIds.some((id) => !available.has(id))) return '选票包含不在正式候选名单中的作品，请重新选择。'
  return ''
}

export function tallyAwardResults(
  candidates: AwardCandidate[],
  ballots: AwardBallot[],
  campaignId: string,
  rule: AwardVotingRule = 'legacy',
  rules: AwardBallotRules = DEFAULT_BALLOT_RULES,
): AwardResult[] {
  // Keep only the last submitted ballot per account, including on restored preview data.
  const latestBallots = new Map<string, AwardBallot>()
  for (const ballot of ballots) {
    if (ballot.campaignId !== campaignId) continue
    const previous = latestBallots.get(ballot.accountId)
    if (!previous || Date.parse(previous.updatedAt) <= Date.parse(ballot.updatedAt))
      latestBallots.set(ballot.accountId, ballot)
  }
  const counts = new Map(candidates.map((candidate) => [candidate.id, 0]))
  const breakdown = new Map(
    candidates.map((c) => [c.id, { loveVotes: 0, likeVotes: 0, recommendationCount: 0 }]),
  )
  for (const ballot of latestBallots.values()) {
    if (rule === 'weighted-v1') {
      const input = {
        loveId: ballot.loveId ?? null,
        loveIds: ballot.loveIds,
        likeIds: ballot.likeIds || [],
        recommendations: ballot.recommendations || [],
      }
      if (validateWeightedBallot(input, candidates, rules)) continue
      for (const id of loveChoices(input)) {
        counts.set(id, counts.get(id)! + rules.lovePoints)
        breakdown.get(id)!.loveVotes++
      }
      for (const id of input.likeIds) {
        counts.set(id, counts.get(id)! + rules.likePoints)
        breakdown.get(id)!.likeVotes++
      }
      for (const rec of input.recommendations) {
        counts.set(rec.candidateId, counts.get(rec.candidateId)! + rules.recommendationPoints)
        breakdown.get(rec.candidateId)!.recommendationCount++
      }
    } else
      for (const id of new Set(ballot.candidateIds)) if (counts.has(id)) counts.set(id, counts.get(id)! + 1)
  }
  const sorted = candidates
    .map((candidate) => ({
      ...candidate,
      ...(rule === 'weighted-v1' ? breakdown.get(candidate.id) : {}),
      votes: counts.get(candidate.id) || 0,
      rank: 0,
    }))
    .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title, 'zh-CN'))
  for (let index = 0; index < sorted.length; index++)
    sorted[index]!.rank =
      index > 0 && sorted[index]!.votes === sorted[index - 1]!.votes ? sorted[index - 1]!.rank : index + 1
  return sorted
}

export function validatePhaseTransition(
  from: CampaignPhase,
  to: CampaignPhase,
  pendingCount: number,
  candidateCount: number,
) {
  const next: Partial<Record<CampaignPhase, CampaignPhase>> = {
    draft: 'nomination',
    nomination: 'voting',
    voting: 'results',
    results: 'archived',
  }
  if (next[from] !== to) return '活动需按筹备、提名、投票、公布、归档的顺序推进。'
  if (to === 'voting' && pendingCount) return '请先处理所有待审核提名，再开启投票。'
  if (to === 'voting' && !candidateCount) return '至少需要一部审核通过的作品才能开启投票。'
  return ''
}

export function normalizeCampaignConfirmation(value: string) {
  return value.normalize('NFKC').replace(/\s+/gu, '')
}
