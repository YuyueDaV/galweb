import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { Catalog, workContributionSchema } from '../src/catalog'
import { nominationDetailsRevision } from '../src/nomination-details'

test(
  '排名与提名使用关联书库最新会社，历史署名推荐词及冻结分数保留',
  {
    skip: process.env.AUTH_INTEGRATION !== '1',
  },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      catalog = new Catalog(db, platform)
    const awards = new Awards(db, platform, catalog)
    try {
      const actors: Actor[] = []
      for (const role of ['super_admin', 'member', 'member'] as const) {
        const id = randomUUID(),
          nickname = role + actors.length
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, id + '@example.com', id + '@example.com', nickname, 'fixture', role, Date.now(), Date.now()],
        )
        actors.push({ id, role, nickname, status: 'active' })
      }
      const [owner, first, second] = actors as [Actor, Actor, Actor]
      const work = await catalog.contribute(
        owner,
        workContributionSchema.parse({ title: 'Rewrite ' + randomUUID() }),
      )
      const campaign = await awards.create(owner)
      assert.ok(campaign.edition >= 2)
      await awards.settings(owner, campaign.id, { ...campaign, winnerCount: 1 })
      await awards.phase(owner, campaign.id, 'nomination', (await awards.campaign(campaign.id)).version!)
      for (const actor of [first, second])
        await awards.nominate(actor, campaign.id, work.title, '', '不计分的提名说明', { workId: work.rank })
      const nominations = await awards.nominations(campaign.id)
      for (const nomination of nominations)
        await awards.nominationAction(owner, campaign.id, nomination.id, 'approved')
      const candidateId = nominations[0]!.candidateId
      await awards.phase(owner, campaign.id, 'voting', (await awards.campaign(campaign.id)).version!)
      for (const actor of [first, second])
        await awards.vote(actor, campaign.id, [candidateId], 0, {
          loveId: candidateId,
          likeIds: [],
          recommendations: [{ candidateId, text: '署名推荐词 / ' + actor.nickname }],
        })
      await catalog.edit(owner, work.rank, {
        title: work.title,
        subtitle: '',
        studio: 'Key',
        description: '',
        nominator: work.nominator,
        version: work.version,
      })
      const rawNominations = await awards.nominations(campaign.id)
      assert.ok(rawNominations.every((n) => n.studio === ''))
      const live = await awards.state(campaign.id, owner)
      assert.equal(live.results[0]!.studio, 'Key')
      assert.ok(live.nominations.every((n) => n.studio === 'Key'))
      for (const original of rawNominations)
        assert.equal(
          live.nominations.find((n) => n.id === original.id)!.detailsRevision,
          nominationDetailsRevision(original),
        )
      // A metadata read must not invalidate the existing nomination edit revision.
      await awards.editNominationDetails(owner, campaign.id, {
        entries: [
          {
            id: rawNominations[0]!.id,
            revision: live.nominations.find((n) => n.id === rawNominations[0]!.id)!.detailsRevision!,
            nominatorName: '更正后的提名人',
            nominatedAt: rawNominations[0]!.createdAt,
            reason: '更正说明',
          },
        ],
      })
      await awards.phase(owner, campaign.id, 'results', (await awards.campaign(campaign.id)).version!)
      const ballots = await db.rows('SELECT data,version FROM award_ballots WHERE campaign_id=?', [
        campaign.id,
      ])
      const frozen = await db.rows('SELECT data FROM award_results WHERE campaign_id=?', [campaign.id])
      const verify = async () => {
        const state = await awards.state(campaign.id)
        assert.equal(state.results[0]!.studio, 'Key')
        assert.equal(state.results[0]!.votes, 8)
        assert.equal(state.results[0]!.rank, 1)
        assert.deepEqual(
          state.recommendations.map((entry) => entry.authorName).sort(),
          [first.nickname, second.nickname].sort(),
        )
        assert.ok(state.recommendations.every((entry) => entry.text.startsWith('署名推荐词 / ')))
        assert.ok(state.recommendations.every((entry) => !('accountId' in entry) && !('loveId' in entry)))
        assert.equal('ballots' in state, false)
        assert.equal('rounds' in state, false)
        assert.deepEqual(
          await db.rows('SELECT data FROM award_results WHERE campaign_id=?', [campaign.id]),
          frozen,
        )
        assert.deepEqual(
          await db.rows('SELECT data,version FROM award_ballots WHERE campaign_id=?', [campaign.id]),
          ballots,
        )
      }
      await verify()
      // Published recommendations remain readable even if nominations are removed later.
      const record = (await awards.maintenance.records(owner, campaign.id))[0]!
      await awards.maintenance.change(owner, campaign.id, candidateId, {
        action: 'remove',
        revision: record.revision,
        confirmation: work.title,
      })
      await verify()
      await awards.phase(owner, campaign.id, 'archived', (await awards.campaign(campaign.id)).version!)
      await verify()
    } finally {
      await db.pool.end()
    }
  },
)
