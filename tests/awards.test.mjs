import test from 'node:test'
import assert from 'node:assert/strict'
import { hasAwardPermission, permissionLabels, normalizeWorkTitle, validateCampaignSettings, campaignWindowMessage, collectAwardCandidates, validateBallot, tallyAwardResults, validatePhaseTransition, toAwardTimeInput, fromAwardTimeInput } from '../apps/web/app/utils/awards.ts'

const campaign = { id: 'second', edition: 2, title: '第二届十二橙器', phase: 'draft', nominationLimit: 3, voteLimit: 12, winnerCount: 12, nominationStart: null, nominationEnd: null, votingStart: null, votingEnd: null, createdAt: '2026-10-31T00:00:00Z' }
const nomination = (id, candidateId, overrides = {}) => ({ id, candidateId, campaignId: 'second', title: candidateId, studio: '', reason: '一个值得分享给所有同好的故事。', accountId: id, accountName: id, status: 'approved', createdAt: campaign.createdAt, ...overrides })
const candidates = ['a', 'b', 'c', 'd'].map(id => ({ id, title: id, studio: '', nominations: [] }))
const ballot = (accountId, candidateIds, updatedAt = '2026-11-01T00:00:00Z', campaignId = 'second') => ({ id: accountId + updatedAt, accountId, campaignId, candidateIds, updatedAt })

test('成员、管理员和超级管理员的权限边界', () => {
  for (const role of ['member', 'admin', 'super_admin']) assert.equal(hasAwardPermission(role, 'ballot.submit'), true)
  assert.equal(hasAwardPermission('member', 'campaign.manage'), false)
  assert.equal(hasAwardPermission('admin', 'campaign.manage'), true)
  assert.equal(hasAwardPermission('admin', 'nomination.review'), true)
  for (const permission of Object.keys(permissionLabels)) {
    assert.equal(hasAwardPermission('admin', permission), permission !== 'account.manage')
    assert.equal(hasAwardPermission('super_admin', permission), true)
    assert.equal(hasAwardPermission('member', permission), ['nomination.submit', 'ballot.submit'].includes(permission))
  }
})

test('管理员名额配置必须是有效整数，允许时间待公布', () => {
  assert.equal(validateCampaignSettings(campaign), '')
  for (const field of ['nominationLimit', 'voteLimit', 'winnerCount']) {
    for (const value of [0, 101, 1.5, NaN]) assert.notEqual(validateCampaignSettings({ ...campaign, [field]: value }), '')
  }
  assert.notEqual(validateCampaignSettings({ ...campaign, title: ' ' }), '')
})

test('时间必须成对、先后有效，提名和投票不能重叠', () => {
  const timed = { ...campaign, nominationStart: '2026-11-01T00:00:00Z', nominationEnd: '2026-11-02T00:00:00Z', votingStart: '2026-11-02T00:00:00Z', votingEnd: '2026-11-03T00:00:00Z' }
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
  const result = collectAwardCandidates([
    nomination('u1', 'a'), nomination('u2', 'a'), nomination('u3', 'b'),
    nomination('u4', 'c', { status: 'pending' }), nomination('u5', 'd', { status: 'rejected' }),
    nomination('u6', 'e', { status: 'withdrawn' }), nomination('u7', 'f', { campaignId: 'third' }),
  ], 'second')
  assert.deepEqual(result.map(item => [item.id, item.nominations.length]), [['a', 2], ['b', 1]])
})

test('选票拒绝空票、重复候选、超额和不在正式名单中的候选', () => {
  assert.equal(validateBallot(['a', 'b'], candidates, 2), '')
  for (const ids of [[], ['a', 'a'], ['a', 'b', 'c'], ['unknown']]) assert.notEqual(validateBallot(ids, candidates, 2), '')
})

test('改票只保留每人最新选票，跨届隔离，重复候选不重复计票', () => {
  const result = tallyAwardResults(candidates, [
    ballot('u1', ['a'], '2026-11-01T01:00:00Z'),
    ballot('u1', ['b'], '2026-11-01T02:00:00Z'),
    ballot('u2', ['b', 'b', 'unknown']), ballot('u3', ['a'], undefined, 'third'),
  ], 'second')
  assert.equal(result.find(item => item.id === 'b').votes, 2)
  assert.equal(result.find(item => item.id === 'a').votes, 0)
})

test('结果按实际票数排名，同票并列且后一名跳号', () => {
  const result = tallyAwardResults(candidates, [ballot('u1', ['a', 'b', 'c']), ballot('u2', ['a', 'b'])], 'second')
  assert.deepEqual(result.map(item => [item.id, item.votes, item.rank]), [['a', 2, 1], ['b', 2, 1], ['c', 1, 3], ['d', 0, 4]])
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
