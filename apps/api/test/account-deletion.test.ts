import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import {readFile,access} from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {schema} from '../src/schema'
import {Platform} from '../src/platform'
import {AccountDeletion} from '../src/account-deletion'
import {Auth} from '../src/auth'
import {Mailer} from '../src/mail'
import {Forum} from '../src/forum'
import {Assets} from '../src/assets'
import {Awards} from '../src/awards'
import {hashPassword} from '../src/security'
import {migrateUsernames} from '../src/user-migration'

test('注销完整流程：撤销会话、匿名讨论与榜单、删除图片、释放身份、保留限流与最后一名超管',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const config=readConfig();assert.match(config.DB_NAME,/_test$/);assert.equal(config.MAIL_TRANSPORT,'capture')
 const name=config.DB_NAME.slice(0,35)+'_'+randomBytes(4).toString('hex')+'_deletion_test'
 const setup=new Database(config)
 try{await setup.pool.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4`)}finally{await setup.pool.end()}
 const c={...config,DB_NAME:name},db=new Database(c),platform=new Platform(db),auth=new Auth(db,c,new Mailer(c)),forum=new Forum(db,platform),awards=new Awards(db,platform),assets=new Assets(db,platform),deletion=new AccountDeletion(db,platform)
 const password=randomBytes(24).toString('base64url'),passwordHash=await hashPassword(password)
 async function user(role='member'){
  const id=randomUUID(),email=id+'@example.com',username='u_'+id.replaceAll('-','').slice(0,20),nickname='原昵称_'+id.slice(0,8)
  await db.execute('INSERT INTO users(id,email,email_key,username,username_key,nickname,signature,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,email,email,username,username,nickname,'私人签名',passwordHash,role,Date.now(),Date.now()])
  return {id,email,username,nickname,role,status:'active'}
 }
 const code=async(id:string)=>JSON.parse(await readFile(path.resolve('.data/mail',id+'.json'),'utf8')).text.match(/\d{6}/)[0] as string
 try{
  for(const sql of schema)await db.execute(sql)
  await auth.initialize()
  const owner=await user('super_admin'),member=await user(),other=await user()
  await assert.rejects(()=>deletion.remove(owner,password),/最后一名/)
  const firstSession=await auth.login(member.username,password,'delete-device-1'),secondSession=await auth.login(member.username,password,'delete-device-2')
  const asset=await assets.create(member,await sharp({create:{width:32,height:32,channels:3,background:'orange'}}).png().toBuffer())
  await auth.updateProfile(await auth.session(firstSession.session),{avatarAssetId:asset.id})
  const post=await forum.create(member,{title:'注销测试的历史帖子',content:'这是一段应在注销后匿名保留的公开讨论。',category:'作品讨论',spoiler:false,assetId:asset.id})
  await forum.reply(member,post.id,'我留下的公开回复。');await forum.reply(other,post.id,'另一位用户的公开回复。')
  await forum.reaction(member,post.id,'like',true);await forum.reaction(member,post.id,'bookmark',true);await forum.reaction(other,post.id,'like',true)
  const reset=await auth.requestCode(member.email,'reset','delete-mail-ip'),oldResetCode=await code(reset.challengeId)
  const active=await awards.create(owner)
  await awards.phase(owner,active.id,'nomination',(await awards.campaign(active.id)).version!)
  await awards.nominate(member,active.id,'注销前通过审核的作品','测试制作组','推荐理由足够长，候选应在账号注销后继续保留。')
  let nomination=(await awards.nominations(active.id))[0]!
  await awards.nominationAction(owner,active.id,nomination.id,'approved')
  await awards.phase(owner,active.id,'voting',(await awards.campaign(active.id)).version!)
  await awards.vote(member,active.id,[nomination.candidateId],0,{loveId:nomination.candidateId,likeIds:[],recommendations:[]});await awards.vote(other,active.id,[nomination.candidateId],0,{loveId:nomination.candidateId,likeIds:[],recommendations:[]})
  const pending=await awards.create(owner)
  await awards.phase(owner,pending.id,'nomination',(await awards.campaign(pending.id)).version!)
  await awards.nominate(member,pending.id,'尚未审核的作品','测试制作组','这条尚未审核的提名应在注销后自动撤回。')
  const ended=await awards.create(owner)
  await awards.settings(owner,ended.id,{...ended,winnerCount:1})
  await awards.phase(owner,ended.id,'nomination',(await awards.campaign(ended.id)).version!)
  await awards.nominate(member,ended.id,'已公布的历史作品','测试制作组','这条提名属于历史榜单，应保留得票与名次。')
  const historicalNomination=(await awards.nominations(ended.id))[0]!
  await awards.nominationAction(owner,ended.id,historicalNomination.id,'approved')
  await awards.phase(owner,ended.id,'voting',(await awards.campaign(ended.id)).version!)
  await awards.vote(member,ended.id,[historicalNomination.candidateId],0,{loveId:historicalNomination.candidateId,likeIds:[],recommendations:[]});await awards.vote(other,ended.id,[historicalNomination.candidateId],0,{loveId:historicalNomination.candidateId,likeIds:[],recommendations:[]})
  await awards.phase(owner,ended.id,'results',(await awards.campaign(ended.id)).version!)
  const runoff=await awards.create(owner)
  await awards.phase(owner,runoff.id,'nomination',(await awards.campaign(runoff.id)).version!)
  await awards.nominate(other,runoff.id,'二轮期间注销测试','测试制作组','')
  const runoffNomination=(await awards.nominations(runoff.id))[0]!
  await awards.nominationAction(owner,runoff.id,runoffNomination.id,'approved')
  await awards.phase(owner,runoff.id,'voting',(await awards.campaign(runoff.id)).version!)
  await awards.vote(member,runoff.id,[runoffNomination.candidateId],0,{loveId:runoffNomination.candidateId,likeIds:[],recommendations:[]})
  await awards.startRunoff(owner,runoff.id,(await awards.campaign(runoff.id)).version!)
  const before=await awards.state(ended.id,owner)
  await db.execute('INSERT INTO forum_drafts(user_id,data,updated_at) VALUES (?,?,?)',[member.id,JSON.stringify({content:'私密草稿'}),Date.now()])
  await db.execute('INSERT INTO works(id,data) VALUES (?,?)',[79124,JSON.stringify({rank:79124,title:'注销书单测试'})])
  await db.execute('INSERT INTO user_library(user_id,work_id,state,note,updated_at) VALUES (?,?,?,?,?)',[member.id,79124,'reading','私密短评',Date.now()])
  const peerPost=await forum.create(other,{title:'另一位同好的讨论',content:'验证注销后通知中的发言人也会被匿名处理。',category:'作品讨论',spoiler:false})
  await forum.reply(member,peerPost.id,'这条回复会给另一位同好带来通知。')
  await assert.rejects(()=>deletion.remove(member,'wrong-password'),/密码不正确/)
  assert.equal((await auth.session(firstSession.session)).id,member.id)
  await deletion.remove(member,password)
  for(const table of ['forum_drafts','user_library','notifications'])assert.equal((await db.rows(`SELECT user_id FROM ${table} WHERE user_id=?`,[member.id])).length,0)
  const peerNotifications=await db.rows<{title:string}>('SELECT title FROM notifications WHERE user_id=?',[other.id]);assert.ok(peerNotifications.some(item=>item.title==='一位已注销的同好回复了你的讨论。'));assert.ok(peerNotifications.every(item=>!item.title.includes(member.nickname)))
  const tombstone=(await db.rows<{username:null,email:string,nickname:string,signature:string,password_hash:string,status:string,deleted_at:number}>('SELECT username,email,nickname,signature,password_hash,status,deleted_at FROM users WHERE id=?',[member.id]))[0]!
  assert.equal(tombstone.username,null);assert.notEqual(tombstone.email,member.email);assert.equal(tombstone.nickname,'已注销用户');assert.equal(tombstone.signature,'');assert.equal(tombstone.password_hash,'');assert.equal(tombstone.status,'deleted');assert.ok(Number(tombstone.deleted_at)>0)
  await migrateUsernames(db);assert.equal((await db.rows<{username:null}>('SELECT username FROM users WHERE id=?',[member.id]))[0]!.username,null)
  await assert.rejects(()=>auth.session(firstSession.session),/过期/);await assert.rejects(()=>auth.session(secondSession.session),/过期/)
  await assert.rejects(()=>auth.login(member.username,password,'delete-login-after'),/用户名或密码/)
  assert.equal((await forum.detail(post.id)).author,'已注销用户');assert.equal((await forum.detail(post.id)).uploadedImage,undefined);assert.equal((await forum.detail(post.id)).likes,1)
  const replies=await forum.replies(post.id) as unknown as {author:string}[];assert.equal(replies[0]!.author,'已注销用户');assert.equal(replies[1]!.author,other.nickname)
  assert.deepEqual(await forum.mine(member),{likes:[],bookmarks:[]})
  await assert.rejects(()=>assets.file(asset.id),/不存在/);await assets.cleanupDeletedAccounts();await assert.rejects(()=>access(path.join(assets.directory,asset.id+'.webp')))
  nomination=(await awards.nominations(active.id))[0]!
  assert.equal(nomination.status,'approved');assert.equal(nomination.accountName,'已注销用户');assert.equal(nomination.accountId,'')
  assert.equal((await awards.state(active.id,owner)).ballotCount,1)
  const runoffAfter=await awards.state(runoff.id,owner)
  assert.equal(runoffAfter.results[0]!.votes,2)
  assert.equal(runoffAfter.ballots![0]!.accountId,'')
  assert.equal(runoffAfter.ballots![0]!.accountName,'已注销用户')
  assert.equal((await awards.nominations(pending.id))[0]!.status,'withdrawn')
  const after=await awards.state(ended.id,owner)
  assert.equal(after.ballotCount,before.ballotCount);assert.equal(after.results[0]!.votes,before.results[0]!.votes);assert.equal(after.results[0]!.rank,before.results[0]!.rank);assert.equal(after.results[0]!.nominations[0]!.accountName,'已注销用户')
  await assert.rejects(()=>platform.updateAccount(owner,member.id,{status:'active'}),/已注销/)
  await assert.rejects(()=>forum.create(member,{title:'过期请求不能发帖',content:'已注销账号的旧请求不能再写入新的内容。',category:'作品讨论',spoiler:false}),/不可用/)
  await assert.rejects(()=>forum.reply(member,post.id,'旧请求'),/不可用/)
  await assert.rejects(()=>forum.reaction(member,post.id,'like',true),/不可用/)
  await assert.rejects(()=>awards.vote(member,active.id,[nomination.candidateId],0,{loveId:nomination.candidateId,likeIds:[],recommendations:[]}),/不可用/)
  await assert.rejects(async()=>assets.create(member,await sharp({create:{width:16,height:16,channels:3,background:'blue'}}).png().toBuffer()),/不可用/)
  await assert.rejects(()=>auth.requestCode(member.email,'registration','delete-reregister-ip'),/60/)
  await db.execute('UPDATE email_verification_challenges SET created_at=created_at-61000 WHERE email_key=?',[member.email])
  const registration=await auth.requestCode(member.email,'registration','delete-reregister-ip')
  await auth.complete({email:member.email,username:member.username,password,confirmPassword:password,challengeId:registration.challengeId,code:await code(registration.challengeId)},'registration','delete-new-verify')
  const reborn=await auth.login(member.username,password,'delete-new-login')
  assert.notEqual(reborn.user.id,member.id);assert.equal(reborn.user.role,'member');assert.equal(reborn.user.signature,'');assert.equal(reborn.user.avatarUrl,null)
  await assert.rejects(()=>auth.complete({email:member.email,password,confirmPassword:password,challengeId:reset.challengeId,code:oldResetCode},'reset','delete-old-code'),/验证码无效/)
  await assert.rejects(()=>forum.edit({...reborn.user,status:'active'},post.id,{title:'新账号不能继承旧帖'}),/管理员/)
  const secondOwner=await user('super_admin')
  const deletions=await Promise.allSettled([deletion.remove(owner,password),deletion.remove(secondOwner,password)])
  assert.equal(deletions.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((await db.rows<{n:number}>("SELECT COUNT(*) n FROM users WHERE role='super_admin' AND status='active'"))[0]!.n,1)
  await assert.rejects(()=>assets.hide(deletions[0]!.status==='fulfilled'?owner:secondOwner,randomUUID()),/不可用/)
 }finally{await db.pool.end()}
})
