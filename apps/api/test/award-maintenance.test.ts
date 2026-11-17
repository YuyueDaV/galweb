import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { Catalog, workContributionSchema } from '../src/catalog'
import { nominationDetailsRevision, ownerCandidateSchema } from '../src/nomination-details'

test(
  '超管跨阶段维护：补录、来源、关联、移除恢复、权限并发与已公布分数不重算',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      catalog = new Catalog(db, platform),
      awards = new Awards(db, platform, catalog),
      marker = randomUUID()
    try {
      const actors: Actor[] = []
      for (const role of ['super_admin', 'admin', 'member']) {
        const id = randomUUID()
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, id + '@example.com', id + '@example.com', role, 'fixture', role, Date.now(), Date.now()],
        )
        actors.push({ id, role, nickname: role, status: 'active' })
      }
      const [owner, admin, member] = actors as [Actor, Actor, Actor]
      const works = []
      for (const label of ['A', 'B', 'C', 'D', 'E'])
        works.push(
          await catalog.contribute(
            member,
            workContributionSchema.parse({ title: label + marker, studio: '会社' }),
          ),
        )
      const [a, b, c, d, e] = works
      const campaign = await awards.create(owner)
      await awards.settings(owner, campaign.id, { ...campaign, winnerCount: 1 })
      await awards.phase(owner, campaign.id, 'nomination', (await awards.campaign(campaign.id)).version!)
      await awards.nominate(member, campaign.id, a!.title, '', '原提名', { workId: a!.rank })
      const initial = (await awards.nominations(campaign.id))[0]!
      await awards.nominationAction(owner, campaign.id, initial.id, 'approved')
      await awards.phase(owner, campaign.id, 'voting', (await awards.campaign(campaign.id)).version!)
      await awards.vote(member, campaign.id, [initial.candidateId], 0, {
        loveId: initial.candidateId,
        likeIds: [],
        recommendations: [],
      })
      const originalBallots = await awards.ballots(campaign.id)
      const input = {
        title: b!.title,
        studio: '',
        workId: b!.rank,
        reason: '补录理由',
        nominatorName: '群内成员',
        nominatedAt: new Date(Date.now() - 1000).toISOString(),
        source: 'QQ群',
        informationSource: '官网人工核对',
      }
      for (const actor of [admin, member]) {
        await assert.rejects(() => awards.maintenance.create(actor, campaign.id, input), /超级管理员/)
        await assert.rejects(() => awards.maintenance.records(actor, campaign.id), /超级管理员|管理员/)
      }
      assert.equal(ownerCandidateSchema.safeParse({ ...input, votes: 99 }).success, false)
      await awards.maintenance.create(owner, campaign.id, input)
      let records = await awards.maintenance.records(owner, campaign.id)
      const added = records.find((row) => row.coverRank === b!.rank)!
      assert.equal(added.nominations[0]!.status, 'approved')
      assert.equal(added.nominations[0]!.displayOverride!.nominatorName, '群内成员')
      assert.equal(added.nominations[0]!.informationSource, '官网人工核对')
      await awards.editCandidate(owner, campaign.id, added.id, {
        workId: b!.rank,
        title: b!.title,
        subtitle: '',
        studio: '更正会社',
        description: '资料更正',
        informationSource: 'Bangumi 与官网对照',
        version: b!.version,
      })
      assert.equal(
        (await awards.nominations(campaign.id)).find((n) => n.candidateId === added.id)!.informationSource,
        'Bangumi 与官网对照',
      )
      const linked = await awards.linkCandidateWork(owner, campaign.id, initial.candidateId, {
        currentWorkId: a!.rank,
        currentVersion: a!.version,
        workId: c!.rank,
        version: c!.version,
      })
      assert.equal(linked.candidateId, initial.candidateId)
      assert.equal(linked.merged, false)
      await assert.rejects(
        () =>
          awards.linkCandidateWork(owner, campaign.id, added.id, {
            currentWorkId: b!.rank,
            currentVersion: b!.version + 1,
            workId: c!.rank,
            version: c!.version,
          }),
        /不合并候选身份/,
      )
      assert.deepEqual(await awards.ballots(campaign.id), originalBallots)
      const scores = (await awards.state(campaign.id)).results
      assert.equal(scores.find((row) => row.id === initial.candidateId)!.votes, 2)
      records = await awards.maintenance.records(owner, campaign.id)
      const record = records.find((row) => row.id === initial.candidateId)!
      await assert.rejects(
        () =>
          awards.maintenance.change(admin, campaign.id, record.id, {
            action: 'remove',
            revision: record.revision,
            confirmation: record.title,
          }),
        /超级管理员/,
      )
      await assert.rejects(
        () =>
          awards.maintenance.change(owner, campaign.id, record.id, {
            action: 'remove',
            revision: '0'.repeat(64),
            confirmation: record.title,
          }),
        /已变化/,
      )
      await assert.rejects(
        () =>
          awards.maintenance.change(owner, campaign.id, record.id, {
            action: 'remove',
            revision: record.revision,
            confirmation: '错误名称',
          }),
        /完整作品名称/,
      )
      await awards.maintenance.change(owner, campaign.id, record.id, {
        action: 'remove',
        revision: record.revision,
        confirmation: record.title,
      })
      assert.equal(
        (await awards.state(campaign.id)).results.some((row) => row.id === record.id),
        false,
      )
      await assert.rejects(
        () =>
          awards.vote(member, campaign.id, [record.id], 1, {
            loveId: record.id,
            likeIds: [],
            recommendations: [],
          }),
        /正式候选|名单/,
      )
      const removed = (await awards.maintenance.records(owner, campaign.id)).find(
        (row) => row.id === record.id,
      )!
      assert.equal(removed.removed, true)
      await awards.maintenance.change(owner, campaign.id, record.id, {
        action: 'restore',
        revision: removed.revision,
        confirmation: removed.title,
      })
      assert.equal((await awards.state(campaign.id)).results.find((row) => row.id === record.id)!.votes, 2)
      assert.deepEqual(await awards.ballots(campaign.id), originalBallots)
      await awards.phase(owner, campaign.id, 'results', (await awards.campaign(campaign.id)).version!)
      const frozen = (await awards.state(campaign.id)).results.map((row) => ({
        id: row.id,
        votes: row.votes,
        rank: row.rank,
      }))
      await awards.maintenance.create(owner, campaign.id, { ...input, title: d!.title, workId: d!.rank })
      assert.deepEqual(
        (await awards.state(campaign.id)).results.map((row) => ({
          id: row.id,
          votes: row.votes,
          rank: row.rank,
        })),
        frozen,
      )
      await awards.linkCandidateWork(owner, campaign.id, record.id, {
        currentWorkId: c!.rank,
        currentVersion: c!.version,
        workId: e!.rank,
        version: e!.version,
      })
      let corrected = (await awards.state(campaign.id)).results.find((row) => row.id === record.id)!
      assert.equal(corrected.coverRank, e!.rank)
      assert.equal(corrected.votes, 2)
      assert.equal(corrected.rank, 1)
      assert.ok(
        (await catalog.detail(e!.rank)).awardHonors?.some((honor) => honor.campaignId === campaign.id),
      )
      let nomination = (await awards.nominations(campaign.id)).find((n) => n.candidateId === record.id)!
      const stale = (await awards.maintenance.records(owner, campaign.id)).find(
        (row) => row.id === record.id,
      )!
      await awards.editNominationDetails(owner, campaign.id, {
        candidateId: record.id,
        entries: [
          {
            id: nomination.id,
            revision: nominationDetailsRevision(nomination),
            nominatorName: '更正提名人',
            nominatedAt: new Date(Date.now() - 2000).toISOString(),
            reason: '资料更正',
            source: 'QQ群同步',
          },
        ],
      })
      nomination = (await awards.nominations(campaign.id)).find((n) => n.id === nomination.id)!
      assert.equal(nomination.displayOverride!.nominatorName, '更正提名人')
      assert.equal(nomination.accountName, member.nickname)
      await assert.rejects(
        () =>
          awards.maintenance.change(owner, campaign.id, record.id, {
            action: 'remove',
            revision: stale.revision,
            confirmation: stale.title,
          }),
        /已变化/,
      )
      const latest = (await awards.maintenance.records(owner, campaign.id)).find(
        (row) => row.id === record.id,
      )!
      await awards.maintenance.change(owner, campaign.id, record.id, {
        action: 'remove',
        revision: latest.revision,
        confirmation: latest.title,
      })
      corrected = (await awards.state(campaign.id)).results.find((row) => row.id === record.id)!
      assert.equal(corrected.votes, 2)
      assert.equal(corrected.rank, 1)
      assert.equal(corrected.nominations.length, 0)
      await awards.phase(owner, campaign.id, 'archived', (await awards.campaign(campaign.id)).version!)
      await awards.maintenance.create(owner, campaign.id, {
        ...input,
        title: '归档补录' + marker,
        workId: undefined,
      })
      assert.deepEqual(
        (await awards.state(campaign.id)).results.map((row) => ({
          id: row.id,
          votes: row.votes,
          rank: row.rank,
        })),
        frozen,
      )
      // Removing a leading candidate during a tie-break must not leave holes
      // that would incorrectly exclude remaining works from the winner slots.
      const tieCampaign = await awards.create(owner)
      await awards.settings(owner, tieCampaign.id, { ...tieCampaign, winnerCount: 2 })
      for (const work of [a!, b!, c!])
        await awards.maintenance.create(owner, tieCampaign.id, {
          ...input,
          title: work.title,
          workId: work.rank,
        })
      await awards.phase(
        owner,
        tieCampaign.id,
        'nomination',
        (await awards.campaign(tieCampaign.id)).version!,
      )
      await awards.phase(owner, tieCampaign.id, 'voting', (await awards.campaign(tieCampaign.id)).version!)
      const entries = await awards.nominations(tieCampaign.id)
      const ids = [a!, b!, c!].map((work) => entries.find((n) => n.coverRank === work.rank)!.candidateId)
      await awards.vote(member, tieCampaign.id, [ids[0]!], 0, {
        loveId: ids[0]!,
        likeIds: [],
        recommendations: [{ candidateId: ids[0]!, text: '首轮推荐加分' }],
      })
      await awards.vote(owner, tieCampaign.id, [ids[1]!], 0, {
        loveId: ids[1]!,
        likeIds: [],
        recommendations: [],
      })
      await awards.vote(admin, tieCampaign.id, [ids[2]!], 0, {
        loveId: ids[2]!,
        likeIds: [],
        recommendations: [],
      })
      await awards.startTieBreak(owner, tieCampaign.id, (await awards.campaign(tieCampaign.id)).version!)
      const round = (await awards.campaign(tieCampaign.id)).votingRound!
      await awards.vote(owner, tieCampaign.id, [ids[1]!], 0, undefined, round)
      await awards.vote(member, tieCampaign.id, [ids[2]!], 0, undefined, round)
      const leading = (await awards.maintenance.records(owner, tieCampaign.id)).find(
        (row) => row.id === ids[0],
      )!
      await awards.maintenance.change(owner, tieCampaign.id, leading.id, {
        action: 'remove',
        revision: leading.revision,
        confirmation: leading.title,
      })
      assert.deepEqual(
        (await awards.state(tieCampaign.id)).results.map((result) => result.rank),
        [1, 1],
      )
      await awards.vote(admin, tieCampaign.id, [ids[1]!], 0, undefined, round)
      assert.deepEqual(
        (await awards.state(tieCampaign.id)).results.map((result) => result.rank),
        [1, 2],
      )
    } finally {
      await db.pool.end()
    }
  },
)
