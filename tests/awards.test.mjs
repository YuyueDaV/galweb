import test from 'node:test'
import {
  DEFAULT_BALLOT_RULES,
  validateWeightedBallot,
  normalizeCampaign,
} from '../apps/web/app/utils/awards.ts'
import assert from 'node:assert/strict'
import {
  hasAwardPermission,
  permissionLabels,
  normalizeWorkTitle,
  validateCampaignSettings,
  campaignWindowMessage,
  collectAwardCandidates,
  combineAwardRoundResults,
  validateBallot,
  tallyAwardResults,
  validatePhaseTransition,
  toAwardTimeInput,
  fromAwardTimeInput,
  findAwardTieGroups,
  combineAwardTieBreakResults,
  validateTieBreakBallot,
  awardVotingCandidates,
} from '../apps/web/app/utils/awards.ts'

test('同票加赛只重排组内名次，多组独立处理，零票未入选作品不进入加赛', () => {
  const original = [
    ['a', 9, 1], ['b', 6, 2], ['c', 6, 2], ['d', 6, 2], ['e', 4, 5],
    ['f', 2, 6], ['g', 2, 6], ['zero1', 0, 8], ['zero2', 0, 8],
  ].map(([id, votes, rank]) => ({ id, votes, rank, title: id, studio: '', nominations: [], likeVotes: votes }))
  const groups = findAwardTieGroups(original)
  assert.deepEqual(groups, [{ rank: 2, candidateIds: ['b', 'c', 'd'] }, { rank: 6, candidateIds: ['f', 'g'] }])
  const round2 = combineAwardTieBreakResults(original, [
    { id: 'b', votes: 1 }, { id: 'c', votes: 1 }, { id: 'd', votes: 0 },
    { id: 'f', votes: 3 }, { id: 'g', votes: 2 },
  ], groups, 2)
  assert.deepEqual(findAwardTieGroups(round2), [{ rank: 2, candidateIds: ['b', 'c'] }])
  assert.equal(round2.find((item) => item.id === 'd').rank, 4)
  assert.equal(round2.find((item) => item.id === 'g').rank, 7)
  const round3 = combineAwardTieBreakResults(round2, [{ id: 'b', votes: 0 }, { id: 'c', votes: 2 }], findAwardTieGroups(round2), 3)
  assert.deepEqual(findAwardTieGroups(round3), [])
  assert.deepEqual(round3.filter((item) => item.votes > 0).map((item) => item.id), ['a', 'c', 'b', 'd', 'e', 'f', 'g'])
  assert.deepEqual(round3.find((item) => item.id === 'b').tieBreakScores, [{ round: 2, votes: 1 }, { round: 3, votes: 0 }])
  assert.equal(round3.find((item) => item.id === 'd').tieBreakScores.length, 1)
  for (const item of round3) {
    const before = original.find((source) => source.id === item.id)
    assert.equal(item.votes, before.votes)
    assert.equal(item.likeVotes, before.likeVotes)
  }
  assert.equal(original.find((item) => item.id === 'd').rank, 2, '计算不修改原快照')
  assert.equal(round3.filter((item) => item.votes > 0 && item.rank <= 3).length, 3, '入选边界不会因同票超额')
})

test('同票加赛每组最多一票，重复同票可持续加赛，没有选票不能凭空决出名次', () => {
  const groups = [{ rank: 1, candidateIds: ['a', 'b'] }, { rank: 3, candidateIds: ['c', 'd'] }]
  assert.equal(validateTieBreakBallot(['a', 'c'], groups), '')
  for (const ids of [[], ['a', 'b'], ['a', 'a'], ['outside']]) assert.notEqual(validateTieBreakBallot(ids, groups), '')
  const candidates = ['a', 'b', 'c', 'd', 'outside'].map((id) => ({ id }))
  assert.deepEqual(awardVotingCandidates({ votingMode: 'tie-break', tieBreakGroups: groups, lockedCandidateIds: ['a'] }, candidates).map((item) => item.id), ['a', 'b', 'c', 'd'])
  let results = ['a', 'b'].map((id) => ({ id, votes: 6, rank: 1 }))
  for (let round = 2; round <= 12; round++) {
    results = combineAwardTieBreakResults(results, [], findAwardTieGroups(results), round)
    assert.equal(findAwardTieGroups(results).length, 1)
  }
  assert.equal(results[0].tieBreakScores.length, 11)
  const resolved = combineAwardTieBreakResults(results, [{ id: 'b', votes: 1 }], findAwardTieGroups(results), 13)
  assert.deepEqual(resolved.map((item) => [item.id, item.rank]), [['b', 1], ['a', 2]])
  assert.deepEqual(findAwardTieGroups(resolved), [])
})

const campaign = {
  id: 'second',
  edition: 2,
  title: '第二届十二橙器',
  phase: 'draft',
  nominationLimit: 3,
  voteLimit: 12,
  winnerCount: 12,
  nominationStart: null,
  nominationEnd: null,
  votingStart: null,
  votingEnd: null,
  createdAt: '2026-10-31T00:00:00Z',
}
const nomination = (id, candidateId, overrides = {}) => ({
  id,
  candidateId,
  campaignId: 'second',
  title: candidateId,
  studio: '',
  reason: '一个值得分享给所有同好的故事。',
  accountId: id,
  accountName: id,
  status: 'approved',
  createdAt: campaign.createdAt,
  ...overrides,
})
const candidates = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id, studio: '', nominations: [] }))
const ballot = (accountId, candidateIds, updatedAt = '2026-11-01T00:00:00Z', campaignId = 'second') => ({
  id: accountId + updatedAt,
  accountId,
  campaignId,
  candidateIds,
  updatedAt,
})

test('二次投票保留首轮作品，新高分不会挤掉首轮名额', () => {
  const first = candidates.map((item, index) => ({ ...item, votes: index === 0 ? 1 : 0, rank: index + 1 }))
  const next = candidates.map((item, index) => ({ ...item, votes: index === 1 ? 99 : 0, rank: index + 1 }))
  const combined = combineAwardRoundResults(first, next)
  assert.equal(combined[0].id, 'a')
  assert.equal(combined[0].votes, 1)
  assert.equal(combined[1].id, 'b')
  assert.equal(combined[1].votes, 99)
  assert.equal(combined[1].qualifiedRound, 2)
})

test('真爱、喜爱与推荐词：分值、互斥、份数与管理员自定义', () => {
  const input = {
    loveId: 'a',
    likeIds: ['b', 'c'],
    recommendations: [
      { candidateId: 'a', text: '推荐真爱作品' },
      { candidateId: 'b', text: '也推荐喜欢的作品' },
    ],
  }
  assert.equal(validateWeightedBallot(input, candidates), '')
  assert.notEqual(validateWeightedBallot({ ...input, likeIds: ['a'] }, candidates), '')
  assert.notEqual(validateWeightedBallot({ ...input, likeIds: ['b', 'c', 'd'] }, candidates), '')
  assert.notEqual(
    validateWeightedBallot(
      { ...input, recommendations: [{ candidateId: 'd', text: '没有投票' }] },
      candidates,
    ),
    '',
  )
  assert.notEqual(
    validateWeightedBallot(
      {
        ...input,
        recommendations: [
          { candidateId: 'a', text: '一份' },
          { candidateId: 'a', text: '重复' },
        ],
      },
      candidates,
    ),
    '',
  )
  const b = { ...ballot('member', ['a', 'b', 'c']), ...input }
  const result = tallyAwardResults(candidates, [b], 'second', 'weighted-v1')
  assert.deepEqual(
    result.map((c) => [c.id, c.votes]),
    [
      ['a', 4],
      ['b', 3],
      ['c', 1],
      ['d', 0],
    ],
  )
  const rules = { ...DEFAULT_BALLOT_RULES, lovePoints: 5, likePoints: 3, recommendationPoints: 4 }
  const custom = tallyAwardResults(candidates, [b], 'second', 'weighted-v1', rules)
  assert.equal(custom.find((c) => c.id === 'a').votes, 9)
  assert.equal(custom.find((c) => c.id === 'b').votes, 7)
  assert.equal(
    validateWeightedBallot(
      { loveId: null, loveIds: ['a', 'b'], likeIds: [], recommendations: [] },
      candidates,
      { ...rules, loveLimit: 2 },
    ),
    '',
  )
  assert.notEqual(validateWeightedBallot(input, candidates, { ...rules, recommendationLimit: 0 }), '')
  assert.equal(normalizeCampaign(campaign).votingRule, 'weighted-v1')
  assert.equal(normalizeCampaign({ ...campaign, phase: 'archived' }).votingRule, 'legacy')
})

test('成员、管理员和超级管理员的权限边界', () => {
  for (const role of ['member', 'admin', 'super_admin'])
    assert.equal(hasAwardPermission(role, 'ballot.submit'), true)
  assert.equal(hasAwardPermission('member', 'campaign.manage'), false)
  assert.equal(hasAwardPermission('admin', 'campaign.manage'), true)
  assert.equal(hasAwardPermission('admin', 'nomination.review'), true)
  for (const permission of Object.keys(permissionLabels)) {
    assert.equal(hasAwardPermission('admin', permission), !permission.startsWith('account.'))
    assert.equal(hasAwardPermission('super_admin', permission), true)
    assert.equal(
      hasAwardPermission('member', permission),
      ['nomination.submit', 'ballot.submit'].includes(permission),
    )
  }
})

test('管理员名额配置必须是有效整数，允许时间待公布', () => {
  assert.equal(validateCampaignSettings(campaign), '')
  for (const field of ['nominationLimit', 'voteLimit', 'winnerCount']) {
    for (const value of [0, 101, 1.5, NaN])
      assert.notEqual(validateCampaignSettings({ ...campaign, [field]: value }), '')
  }
  assert.notEqual(validateCampaignSettings({ ...campaign, title: ' ' }), '')
})

test('时间必须成对、先后有效，提名和投票不能重叠', () => {
  const timed = {
    ...campaign,
    nominationStart: '2026-11-01T00:00:00Z',
    nominationEnd: '2026-11-02T00:00:00Z',
    votingStart: '2026-11-02T00:00:00Z',
    votingEnd: '2026-11-03T00:00:00Z',
  }
  assert.equal(validateCampaignSettings(timed), '')
  assert.notEqual(validateCampaignSettings({ ...timed, nominationEnd: null }), '')
  assert.notEqual(validateCampaignSettings({ ...timed, votingStart: timed.nominationStart }), '')
  assert.notEqual(validateCampaignSettings({ ...timed, votingEnd: timed.votingStart }), '')
  assert.notEqual(validateCampaignSettings({ ...timed, nominationStart: 'invalid' }), '')
  assert.notEqual(campaignWindowMessage(timed, 'nomination', Date.parse(timed.nominationStart) - 1), '')
  assert.equal(campaignWindowMessage(timed, 'nomination', Date.parse(timed.nominationStart)), '')
  assert.notEqual(campaignWindowMessage(timed, 'nomination', Date.parse(timed.nominationEnd)), '')
  assert.equal(campaignWindowMessage(campaign, 'voting'), '')
})

test('UTC+8 日期输入转换保持时区和跨日正确', () => {
  assert.equal(fromAwardTimeInput('2026-11-01T00:30'), '2026-10-31T16:30:00.000Z')
  assert.equal(toAwardTimeInput('2026-10-31T16:30:00.000Z'), '2026-11-01T00:30')
  assert.equal(fromAwardTimeInput(''), null)
  assert.equal(toAwardTimeInput(null), '')
})

test('提名规范化及候选集合：仅合并当届通过审核的作品', () => {
  assert.equal(normalizeWorkTitle('Ｆａｔｅ／stay night'), normalizeWorkTitle('Fate/stay night'))
  const result = collectAwardCandidates(
    [
      nomination('u1', 'a'),
      nomination('u2', 'a'),
      nomination('u3', 'b'),
      nomination('u4', 'c', { status: 'pending' }),
      nomination('u5', 'd', { status: 'rejected' }),
      nomination('u6', 'e', { status: 'withdrawn' }),
      nomination('u7', 'f', { campaignId: 'third' }),
    ],
    'second',
  )
  assert.deepEqual(
    result.map((item) => [item.id, item.nominations.length]),
    [
      ['a', 2],
      ['b', 1],
    ],
  )
})

test('选票拒绝空票、重复候选、超额和不在正式名单中的候选', () => {
  assert.equal(validateBallot(['a', 'b'], candidates, 2), '')
  for (const ids of [[], ['a', 'a'], ['a', 'b', 'c'], ['unknown']])
    assert.notEqual(validateBallot(ids, candidates, 2), '')
})

test('改票只保留每人最新选票，跨届隔离，重复候选不重复计票', () => {
  const result = tallyAwardResults(
    candidates,
    [
      ballot('u1', ['a'], '2026-11-01T01:00:00Z'),
      ballot('u1', ['b'], '2026-11-01T02:00:00Z'),
      ballot('u2', ['b', 'b', 'unknown']),
      ballot('u3', ['a'], undefined, 'third'),
    ],
    'second',
  )
  assert.equal(result.find((item) => item.id === 'b').votes, 2)
  assert.equal(result.find((item) => item.id === 'a').votes, 0)
})

test('实时计分保留同票组，供加赛决定最终位次', () => {
  const result = tallyAwardResults(
    candidates,
    [ballot('u1', ['a', 'b', 'c']), ballot('u2', ['a', 'b'])],
    'second',
  )
  assert.deepEqual(
    result.map((item) => [item.id, item.votes, item.rank]),
    [
      ['a', 2, 1],
      ['b', 2, 1],
      ['c', 1, 3],
      ['d', 0, 4],
    ],
  )
})

test('阶段不可跳跃或倒退，待审核或无候选时禁止开放投票', () => {
  assert.equal(validatePhaseTransition('draft', 'nomination', 0, 0), '')
  assert.notEqual(validatePhaseTransition('draft', 'voting', 0, 1), '')
  assert.notEqual(validatePhaseTransition('voting', 'nomination', 0, 1), '')
  assert.notEqual(validatePhaseTransition('nomination', 'voting', 1, 1), '')
  assert.notEqual(validatePhaseTransition('nomination', 'voting', 0, 0), '')
  assert.equal(validatePhaseTransition('nomination', 'voting', 0, 1), '')
  assert.equal(validatePhaseTransition('voting', 'results', 0, 1), '')
  assert.equal(validatePhaseTransition('results', 'archived', 0, 1), '')
  assert.notEqual(validatePhaseTransition('archived', 'results', 0, 1), '')
})
