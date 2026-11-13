import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Awards } from '../src/awards'
import { Catalog, workContributionSchema } from '../src/catalog'
import { Bangumi } from '../src/bangumi'
import { collectAwardCandidates, normalizeWorkTitle } from '../src/award-rules'
import type { AwardNomination } from '../src/award-types'

test(
  '作品来源、提交前后管理权限、书库复用与候选合并保持原始提名和跨届隔离',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const db = new Database(config),
      platform = new Platform(db),
      marker = randomUUID()
    const bangumi = new Bangumi(async (url) =>
      Response.json({
        id: Number(String(url).split('/').at(-1)),
        type: 4,
        name: '原作 ' + marker,
        name_cn: '来源原作 ' + marker,
        summary: '',
        infobox: [{ key: '开发', value: '资料会社' }],
      }),
    )
    const catalog = new Catalog(db, platform, bangumi),
      awards = new Awards(db, platform, catalog)
    try {
      const actors: Actor[] = []
      for (const role of ['super_admin', 'admin', 'member'] as const) {
        const id = randomUUID()
        await db.execute(
          'INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',
          [id, id + '@example.com', id + '@example.com', role, 'unused', role, Date.now(), Date.now()],
        )
        actors.push({ id, role, nickname: role, status: 'active' })
      }
      const [owner, admin, member] = actors as [Actor, Actor, Actor]
      const a = await catalog.contribute(
        member,
        workContributionSchema.parse({ title: '原关联 ' + marker, studio: '原会社' }),
      )
      assert.equal(a.submittedForAwards, false)
      const before = {
        title: a.title,
        subtitle: a.subtitle,
        studio: '管理员补全',
        description: '提交前可修改',
        nominator: a.nominator,
        version: a.version,
      }
      const edited = await catalog.edit(admin, a.rank, before)
      const c = await awards.create(owner)
      await awards.settings(owner, c.id, { ...c, winnerCount: 1 })
      await awards.phase(owner, c.id, 'nomination', (await awards.campaign(c.id)).version!)
      await awards.nominate(member, c.id, '不采信的标题', '', '普通成员的提名', { workId: a.rank })
      const original = (await awards.nominations(c.id))[0]!
      assert.deepEqual(original.workSource, { kind: 'catalog', workId: a.rank, title: '不采信的标题' })
      assert.equal((await catalog.detail(a.rank)).submittedForAwards, true)
      for (const actor of [member, admin]) {
        await assert.rejects(() => catalog.changeCover(actor, a.rank, null, edited.version), /仅限超级管理员/)
        await assert.rejects(() => awards.candidateInfo(actor, c.id, original.candidateId), /管理员/)
      }
      await assert.rejects(
        () => catalog.edit(admin, a.rank, { ...before, version: edited.version }),
        /仅限超级管理员/,
      )
      await assert.rejects(() => catalog.remove(admin, a.rank, edited.version), /仅限超级管理员/)
      await assert.rejects(() => catalog.import(admin, 996101, a.rank, edited.version), /仅限超级管理员/)
      const info = await awards.candidateInfo(owner, c.id, original.candidateId)
      assert.equal(info.work.rank, a.rank)
      assert.equal(info.submissions[0]!.accountName, member.nickname)
      await awards.editCandidate(owner, c.id, original.candidateId, {
        workId: a.rank,
        title: a.title,
        subtitle: '',
        studio: '超管修正',
        description: '',
        version: edited.version,
      })
      const current = await catalog.detail(a.rank)
      const b = await catalog.contribute(
        member,
        workContributionSchema.parse({ title: '正确书库条目 ' + marker }),
      )
      const link = {
        currentWorkId: a.rank,
        currentVersion: current.version,
        workId: b.rank,
        version: b.version,
      }
      await assert.rejects(
        () => awards.linkCandidateWork(admin, c.id, original.candidateId, link),
        /超级管理员/,
      )
      await assert.rejects(
        () => awards.linkCandidateWork(owner, c.id, original.candidateId, { ...link, currentVersion: 0 }),
        /已变更/,
      )
      const other = await awards.create(owner)
      await awards.phase(owner, other.id, 'nomination', other.version!)
      await awards.nominate(owner, other.id, a.title, '', '其他届次原记录', { workId: a.rank })
      const otherBefore = await awards.nominations(other.id)
      await assert.rejects(
        () => awards.linkCandidateWork(owner, other.id, original.candidateId, link),
        /不存在/,
      )
      const linked = await awards.linkCandidateWork(owner, c.id, original.candidateId, link)
      assert.equal(linked.candidateId, original.candidateId)
      assert.equal(linked.merged, false)
      assert.equal((await awards.nominations(c.id))[0]!.coverRank, b.rank)
      assert.equal((await awards.nominations(c.id))[0]!.workSource!.workId, a.rank)
      await assert.rejects(
        () =>
          awards.editCandidate(owner, c.id, original.candidateId, {
            workId: a.rank,
            title: a.title,
            subtitle: '',
            studio: '',
            description: '',
            version: b.version,
          }),
        /关联已变更/,
      )
      const canonical = await catalog.contribute(
        member,
        workContributionSchema.parse({ title: '正式条目 ' + marker }),
      )
      await awards.nominate(owner, c.id, canonical.title, '', '正式条目提名', { workId: canonical.rank })
      const canonicalNomination = (await awards.nominations(c.id)).find(
        (n) => n.coverRank === canonical.rank,
      )!
      await awards.nominationAction(owner, c.id, original.id, 'approved')
      const beforeMerge = await awards.nominations(c.id)
      const merge = await awards.linkCandidateWork(owner, c.id, original.candidateId, {
        currentWorkId: b.rank,
        currentVersion: b.version,
        workId: canonical.rank,
        version: canonical.version,
      })
      assert.equal(merge.candidateId, canonicalNomination.candidateId)
      assert.equal(merge.merged, true)
      const merged = await awards.nominations(c.id)
      assert.equal(merged.length, beforeMerge.length)
      assert.equal(new Set(merged.map((n) => n.candidateId)).size, 1)
      for (const n of merged) {
        const prior = beforeMerge.find((old) => old.id === n.id)!
        assert.equal(n.accountId, prior.accountId)
        assert.equal(n.reason, prior.reason)
        assert.equal(n.status, prior.status)
        assert.equal(n.createdAt, prior.createdAt)
        assert.equal(n.coverRank, canonical.rank)
      }
      assert.deepEqual(await awards.nominations(other.id), otherBefore)
      assert.equal((await catalog.detail(b.rank)).submittedForAwards, false)
      assert.equal((await catalog.detail(a.rank)).submittedForAwards, true)
      for (const n of merged.filter((n) => n.status === 'pending'))
        await awards.nominationAction(owner, c.id, n.id, 'approved')
      await awards.phase(owner, c.id, 'voting', (await awards.campaign(c.id)).version!)
      await awards.vote(member, c.id, [canonicalNomination.candidateId], 0, {
        loveId: canonicalNomination.candidateId,
        likeIds: [],
        recommendations: [],
      })
      const ballots = await awards.ballots(c.id)
      await assert.rejects(
        () =>
          awards.linkCandidateWork(owner, c.id, canonicalNomination.candidateId, {
            currentWorkId: canonical.rank,
            currentVersion: canonical.version,
            workId: b.rank,
            version: b.version,
          }),
        /投票开始后/,
      )
      assert.deepEqual(await awards.ballots(c.id), ballots)
      assert.ok(
        (await awards.state(c.id, owner)).audit.some((row) => row.action.includes('更正候选书库来源')),
      )

      const imported = await awards.create(owner)
      await awards.phase(owner, imported.id, 'nomination', imported.version!)
      await awards.nominate(member, imported.id, '客户端的别名', '', '从外部资料提交', { subjectId: 996101 })
      const importedNomination = (await awards.nominations(imported.id))[0]!
      assert.equal(importedNomination.workSource!.kind, 'bangumi')
      assert.equal(importedNomination.workSource!.subjectId, 996101)
      const count = (await catalog.works()).length
      await awards.nominate(owner, imported.id, '同一作品另一次提交', '', '补录甲', { subjectId: 996101 })
      await awards.nominate(owner, imported.id, '任意显示标题', '', '补录乙', {
        workId: importedNomination.coverRank,
      })
      assert.equal((await catalog.works()).length, count)
      assert.equal(collectAwardCandidates(await awards.nominations(imported.id), imported.id, true).length, 1)
      assert.equal((await awards.nominations(imported.id)).length, 3)

      const legacy = await awards.create(owner)
      await awards.phase(owner, legacy.id, 'nomination', legacy.version!)
      const seedLegacy = async (title: string, coverRank?: number) => {
        const n: AwardNomination = {
          id: randomUUID(),
          candidateId: randomUUID(),
          campaignId: legacy.id,
          title,
          studio: '',
          reason: '旧提名说明',
          accountId: member.id,
          accountName: member.nickname,
          createdAt: new Date().toISOString(),
          status: 'pending',
          ...(coverRank ? { coverRank } : {}),
        }
        await db.execute(
          'INSERT INTO award_candidates(id,campaign_id,normalized_title,data) VALUES (?,?,?,?)',
          [
            n.candidateId,
            legacy.id,
            normalizeWorkTitle(title),
            JSON.stringify({ title, studio: n.studio, coverRank }),
          ],
        )
        await db.execute(
          'INSERT INTO award_nominations(id,campaign_id,candidate_id,user_id,status,data) VALUES (?,?,?,?,?,?)',
          [n.id, legacy.id, n.candidateId, member.id, n.status, JSON.stringify(n)],
        )
        return n
      }
      const missing = await seedLegacy('需要补录的旧提名 ' + marker)
      const workCount = (await catalog.works()).length
      await assert.rejects(
        () => awards.ensureCandidateLibrary(admin, legacy.id, missing.candidateId),
        /超级管理员/,
      )
      const prepared = await awards.ensureCandidateLibrary(owner, legacy.id, missing.candidateId)
      assert.equal(prepared.created, true)
      assert.equal(prepared.candidateId, missing.candidateId)
      assert.equal((await catalog.works()).length, workCount + 1)
      const preparedVersion = (await catalog.detail(prepared.workId)).version
      const again = await awards.ensureCandidateLibrary(owner, legacy.id, missing.candidateId)
      assert.equal(again.created, false)
      assert.equal(again.workId, prepared.workId)
      assert.equal((await catalog.detail(prepared.workId)).version, preparedVersion)
      assert.equal(
        (await awards.nominations(legacy.id)).find((n) => n.id === missing.id)!.reason,
        missing.reason,
      )

      const reuse = await seedLegacy(b.title)
      const reused = await awards.ensureCandidateLibrary(owner, legacy.id, reuse.candidateId)
      assert.equal(reused.workId, b.rank)
      assert.equal(reused.created, false)
      assert.equal((await catalog.works()).length, workCount + 1)
      const alias = '另一个旧标题 ' + marker
      const bLatest = await catalog.detail(b.rank)
      await catalog.edit(owner, b.rank, {
        title: bLatest.title,
        subtitle: alias,
        studio: bLatest.studio,
        description: bLatest.description,
        nominator: bLatest.nominator,
        version: bLatest.version,
      })
      const duplicatedLegacy = await seedLegacy(alias)
      const mergedLegacy = await awards.ensureCandidateLibrary(owner, legacy.id, duplicatedLegacy.candidateId)
      assert.equal(mergedLegacy.candidateId, reuse.candidateId)
      assert.equal(mergedLegacy.workId, b.rank)
      assert.equal(
        (await awards.nominations(legacy.id)).filter((n) => n.candidateId === reuse.candidateId).length,
        2,
      )
      const late = await seedLegacy('投票前已存在的缺失书库旧稿 ' + marker)
      for (const n of await awards.nominations(legacy.id))
        await awards.nominationAction(owner, legacy.id, n.id, 'approved')
      await awards.phase(owner, legacy.id, 'voting', (await awards.campaign(legacy.id)).version!)
      await awards.vote(member, legacy.id, [late.candidateId], 0, {
        loveId: late.candidateId,
        likeIds: [],
        recommendations: [],
      })
      const lateBallots = await awards.ballots(legacy.id)
      const lateScore = (await awards.state(legacy.id)).results.find((r) => r.id === late.candidateId)!.votes
      assert.equal(
        (await awards.ensureCandidateLibrary(owner, legacy.id, late.candidateId)).candidateId,
        late.candidateId,
      )
      assert.deepEqual(await awards.ballots(legacy.id), lateBallots)
      assert.equal(
        (await awards.state(legacy.id)).results.find((r) => r.id === late.candidateId)!.votes,
        lateScore,
      )
      const postVoteDuplicate = await seedLegacy(alias)
      await assert.rejects(
        () => awards.ensureCandidateLibrary(owner, legacy.id, postVoteDuplicate.candidateId),
        /投票开始后不能自动合并/,
      )
      assert.equal(
        (await awards.nominations(legacy.id)).find((n) => n.id === postVoteDuplicate.id)!.coverRank,
        undefined,
      )
      const removedWork = await catalog.contribute(
        owner,
        workContributionSchema.parse({ title: '已移除不可自动恢复 ' + marker }),
      )
      await catalog.remove(owner, removedWork.rank, removedWork.version)
      const removedSource = await seedLegacy(removedWork.title, removedWork.rank)
      await assert.rejects(
        () => awards.ensureCandidateLibrary(owner, legacy.id, removedSource.candidateId),
        /已移出书库/,
      )
      assert.equal((await catalog.detail(removedWork.rank)).catalogDeleted, true)
    } finally {
      await db.pool.end()
    }
  },
)
