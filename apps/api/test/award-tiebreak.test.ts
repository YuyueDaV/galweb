import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Database } from '../src/database'
import { readConfig } from '../src/config'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { findAwardTieGroups } from '../src/award-rules'

test(
  '同票连续加赛、组内单票、版本和权限保护、历史选票及旧归档重新加赛',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config)
    const awards = new Awards(db, new Platform(db))
    try {
      const actors: Actor[] = []
      for (const role of ['admin', 'member', 'member'] as const) {
        const id = randomUUID()
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [
            id,
            id + '@example.com',
            id + '@example.com',
            '加赛' + role,
            'unused',
            role,
            Date.now(),
            Date.now(),
          ],
        )
        actors.push({ id, nickname: '加赛' + role, role, status: 'active' })
      }
      const [admin, member, other] = actors as [Actor, Actor, Actor]
      let c = await awards.create(admin)
      const id = c.id
      const state = () => awards.state(id)
      const refresh = async () => {
        c = await awards.campaign(id)
      }
      const advance = async (phase: 'nomination' | 'voting' | 'results' | 'archived') => {
        await refresh()
        await awards.phase(admin, id, phase, c.version!)
      }
      await awards.settings(admin, id, {
        ...c,
        winnerCount: 4,
        nominationLimit: 6,
        ballotRules: {
          loveLimit: 0,
          likeLimit: 3,
          lovePoints: 2,
          likePoints: 1,
          recommendationPoints: 0,
          recommendationLimit: 3,
        },
      })
      await advance('nomination')
      const marker = randomUUID()
      for (const suffix of ['甲', '乙', '丙', '丁']) await awards.nominate(admin, id, marker + suffix, '', '')
      const nominations = await awards.nominations(id)
      for (const n of nominations) await awards.nominationAction(admin, id, n.id, 'approved')
      const ids = ['甲', '乙', '丙', '丁'].map(
        (suffix) => nominations.find((item) => item.title.endsWith(suffix))!.candidateId,
      )
      const [a, b, cc, d] = ids as [string, string, string, string]
      await advance('voting')
      await awards.vote(member, id, [a, b, cc], 0, {
        loveId: null,
        likeIds: [a, b, cc],
        recommendations: [{ candidateId: b, text: '原始推荐词跨越多轮保留' }],
      })
      await awards.vote(other, id, [a, d], 0, { loveId: null, likeIds: [a, d], recommendations: [] })
      await refresh()
      await assert.rejects(() => awards.phase(admin, id, 'results', c.version!), /同票加赛/)
      await assert.rejects(() => awards.startTieBreak(member, id, c.version!), /管理员/)
      const starts = await Promise.allSettled([
        awards.startTieBreak(admin, id, c.version!),
        awards.startTieBreak(admin, id, c.version!),
      ])
      assert.equal(starts.filter((item) => item.status === 'fulfilled').length, 1)
      await refresh()
      assert.equal(c.votingRound, 2)
      assert.equal(c.votingMode, 'tie-break')
      assert.deepEqual(new Set(c.tieBreakGroups![0]!.candidateIds), new Set([b, cc, d]))
      assert.equal((await awards.state(id, member)).myBallot, null)
      await assert.rejects(() => awards.vote(member, id, [b], 0, undefined, 1), /轮次/)
      await assert.rejects(() => awards.vote(member, id, [a], 0, undefined, 2), /加赛名单/)
      await assert.rejects(() => awards.vote(member, id, [b, cc], 0, undefined, 2), /每组/)
      await assert.rejects(
        () => awards.vote(member, id, [b], 0, { loveId: b, likeIds: [], recommendations: [] }, 2),
        /加赛每组一票/,
      )
      await awards.vote(member, id, [b], 0, undefined, 2)
      await assert.rejects(() => awards.vote(member, id, [cc], 0, undefined, 2), /其他页面/)
      await awards.vote(member, id, null, 1, undefined, 2)
      await awards.vote(member, id, [b], 2, undefined, 2)
      await awards.vote(other, id, [cc], 0, undefined, 2)
      assert.equal((await state()).results.find((item) => item.id === d)!.rank, 4)
      await assert.rejects(() => awards.phase(admin, id, 'results', c.version!), /同票加赛/)
      await awards.startTieBreak(admin, id, c.version!)
      await refresh()
      assert.equal(c.votingRound, 3)
      assert.deepEqual(new Set(c.tieBreakGroups![0]!.candidateIds), new Set([b, cc]))
      await awards.settings(admin, id, {
        ...c,
        votingRound: 1,
        votingMode: 'standard',
        tieBreakGroups: [],
        lockedCandidateIds: [],
      })
      await refresh()
      assert.equal(c.votingRound, 3)
      assert.equal(c.votingMode, 'tie-break')
      assert.equal(c.tieBreakGroups!.length, 1)
      await assert.rejects(() => awards.vote(member, id, [d], 0, undefined, 3), /加赛名单/)
      await awards.vote(member, id, [b], 0, undefined, 3)
      await awards.vote(other, id, [cc], 0, undefined, 3)
      await assert.rejects(() => awards.phase(admin, id, 'results', c.version!), /同票加赛/)
      await awards.startTieBreak(admin, id, c.version!)
      await refresh()
      assert.equal(c.votingRound, 4)
      await awards.vote(member, id, [cc], 0, undefined, 4)
      const final = await state()
      assert.deepEqual(
        final.results.map((item) => item.id),
        [a, cc, b, d],
      )
      assert.deepEqual(
        final.results.map((item) => item.rank),
        [1, 2, 3, 4],
      )
      assert.deepEqual(
        final.results.map((item) => item.votes),
        [2, 1, 1, 1],
      )
      assert.deepEqual(findAwardTieGroups(final.results), [])
      assert.equal(final.recommendations[0]!.text, '原始推荐词跨越多轮保留')
      assert.equal(final.ballotCount, 7)
      assert.equal((await awards.state(id, admin)).ballots!.length, 7)
      assert.equal('ballots' in final, false)
      await assert.rejects(() => awards.startTieBreak(admin, id, c.version!), /没有/)
      await advance('results')
      assert.deepEqual((await state()).results, final.results)
      await advance('archived')
      assert.deepEqual((await state()).results, final.results)

      // Model a historical archive that predates the no-ties rule, then repair it through the real API.
      const [row] = await db.rows<{ data: string | { results: typeof final.results } }>(
        'SELECT data FROM award_results WHERE campaign_id=?',
        [id],
      )
      const stored = typeof row!.data === 'string' ? JSON.parse(row!.data) : row!.data
      stored.results = stored.results.map((item: (typeof final.results)[number]) =>
        item.id === b ? { ...item, rank: 2 } : item,
      )
      await db.execute('UPDATE award_results SET data=? WHERE campaign_id=?', [JSON.stringify(stored), id])
      await refresh()
      await awards.startTieBreak(admin, id, c.version!)
      await refresh()
      assert.equal(c.phase, 'voting')
      assert.equal(c.votingRound, 5)
      await awards.vote(member, id, [b], 0, undefined, 5)
      await advance('results')
      await advance('archived')
      assert.deepEqual(
        (await state()).results.map((item) => item.id),
        [a, b, cc, d],
      )
      const history = await awards.state(id, admin)
      assert.equal(history.ballots!.length, 8)
      assert.equal(history.rounds.length, 4)
      for (const round of [2, 3, 4, 5])
        assert.equal(
          (
            await db.rows('SELECT id FROM notification_broadcasts WHERE event_key=?', [
              `award:${id}:tie-break:${round}`,
            ])
          ).length,
          1,
        )
      for (const phase of ['results', 'archived'])
        assert.equal(
          (
            await db.rows('SELECT id FROM notification_broadcasts WHERE event_key=?', [
              `award:${id}:${phase}:round:5`,
            ])
          ).length,
          1,
        )
    } finally {
      await db.pool.end()
    }
  },
)
