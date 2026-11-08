import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {schema} from '../src/schema'
import {Platform,type Actor} from '../src/platform'
import {Awards} from '../src/awards'
import {hashPassword} from '../src/security'
test('步骤 3：提名审核、并发配额、投票版本、私密性、结果快照和归档',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const config=readConfig();assert.match(config.DB_NAME,/_test$/);const db=new Database(config),platform=new Platform(db),awards=new Awards(db,platform)
 try{
  for(const sql of schema)await db.execute(sql)
  const password=await hashPassword('awards testing passphrase'),actors:Actor[]=[]
  for(const role of ['super_admin','admin','member']){const id=randomUUID();await db.execute('INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,id+'@example.com',id+'@example.com',role,password,role,Date.now(),Date.now()]);actors.push({id,nickname:role,role,status:'active'})}
  const [_owner,admin,member]=actors as [Actor,Actor,Actor]
  await assert.rejects(()=>awards.create(member),/管理员/)
  const c=await awards.create(admin),id=c.id
  await assert.rejects(()=>awards.settings(member,id,c),/管理员/)
  await awards.settings(admin,id,{...c,votingRule:'legacy',nominationLimit:1,voteLimit:1});let current=await awards.campaign(id)
  await assert.rejects(()=>awards.phase(admin,id,'voting',current.version!),/顺序/)
  await awards.phase(admin,id,'nomination',current.version!)
  const attempts=await Promise.allSettled([awards.nominate(member,id,'命运石之门','','这是值得同好阅读与交流的精彩故事。'),awards.nominate(member,id,'魔法使之夜','','我想把这个故事推荐给所有同好阅读。')]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1)
  current=await awards.campaign(id);await assert.rejects(()=>awards.phase(admin,id,'voting',current.version!),/待审核/)
  const n=(await awards.nominations(id))[0]!
  assert.equal((await awards.state(id)).nominations.length,0)
  await assert.rejects(()=>awards.nominationAction(admin,id,n.id,'rejected',''),/原因/)
  await awards.nominationAction(admin,id,n.id,'approved');await awards.phase(admin,id,'voting',current.version!)
  await assert.rejects(()=>awards.vote(member,id,['unknown'],0),/名单/)
  const votes=await Promise.allSettled([awards.vote(member,id,[n.candidateId],0),awards.vote(member,id,[n.candidateId],0)]);assert.equal(votes.filter(r=>r.status==='fulfilled').length,1)
  const publicState=await awards.state(id);assert.equal(publicState.myBallot,null);assert.deepEqual(publicState.results,[]);assert.equal(publicState.audit.length,0);assert.equal(publicState.nominations[0]!.accountId,'')
  await awards.vote(member,id,null,1);assert.equal((await awards.state(id,member)).myBallot,null)
  assert.equal((await awards.state(id,admin)).ballotCount,0)
  await assert.rejects(()=>awards.vote(member,id,[n.candidateId],0),/其他页面/)
  await awards.vote(member,id,[n.candidateId],2)
  current=await awards.campaign(id);await awards.phase(admin,id,'results',current.version!)
  const result=await awards.state(id);assert.equal((result.results[0] as {votes:number}).votes,1);assert.equal(result.ballotCount,1)
  await assert.rejects(()=>awards.vote(member,id,[n.candidateId],3),/阶段/)
  current=await awards.campaign(id);await assert.rejects(()=>awards.phase(member,id,'archived',current.version!),/管理员/);await awards.phase(admin,id,'archived',current.version!)
  assert.deepEqual((await awards.state(id)).results,result.results)
 }finally{await db.pool.end()}
})
