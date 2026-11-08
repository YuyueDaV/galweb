import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import type {Database} from '../src/database'
import {Platform,type Actor} from '../src/platform'
import {Awards} from '../src/awards'

const actor=(role:string):Actor=>({id:randomUUID(),nickname:role,role,status:'active'})

function fixture(current:Actor,target=actor('member'),ownerCount=1){
 const users=new Map([current,target].map(user=>[user.id,{...user}]))
 const writes:{sql:string,values:unknown[]}[]=[]
 const campaign={id:randomUUID(),edition:2,title:'测试活动',phase:'results',version:0,nominationLimit:3,voteLimit:12,winnerCount:12,nominationStart:null,nominationEnd:null,votingStart:null,votingEnd:null,createdAt:new Date().toISOString()}
 const avatarId=randomUUID()
 const db={
  transaction:async<T>(run:(tx:unknown)=>Promise<T>)=>run({}),
  rows:async(sql:string,values:unknown[]=[])=>{
   if(sql.includes('system_locks'))return []
   if(sql.includes('LEFT JOIN assets'))return [
    {id:current.id,username:'fixture-with-image',name:current.nickname,role:current.role,status:current.status,avatarAssetId:avatarId},
    {id:target.id,username:'fixture-without-image',name:target.nickname,role:target.role,status:target.status,avatarAssetId:null},
   ]
   if(sql.includes('COUNT(*) n'))return [{n:ownerCount}]
   if(sql.includes('FROM users WHERE id=?'))return users.has(String(values[0]))?[users.get(String(values[0]))]:[]
   if(sql.includes('MAX(edition)'))return [{edition:3}]
   if(sql.includes('FROM award_campaigns WHERE id=?'))return [{data:campaign,version:campaign.version}]
   if(sql.includes('FROM award_nominations'))return []
   throw new Error('Unexpected database read in permission test: '+sql)
  },
  execute:async(sql:string,values:unknown[]=[])=>{
   writes.push({sql,values})
   if(sql.startsWith('UPDATE users SET role='))Object.assign(users.get(String(values[2]))!,{role:values[0],status:values[1]})
   return {affectedRows:1}
  },
 } as unknown as Database
 const platform=new Platform(db)
 return {platform,awards:new Awards(db,platform),users,writes,campaign,avatarId}
}
const changes=(writes:{sql:string}[])=>writes.filter(write=>!write.sql.includes('system_locks'))

test('账号列表：仅超管可查看账号与头像，普通管理员及成员被拒绝',async()=>{
 for(const role of ['super_admin']){
  const user=actor(role),{platform,avatarId}=fixture(user)
  const accounts=await platform.accounts(user)
  assert.equal(accounts[0]!.avatarUrl,'/api/assets/'+avatarId)
  assert.equal(accounts[1]!.avatarUrl,null)
 }
 for(const role of ['admin','member']){const user=actor(role);await assert.rejects(()=>fixture(user).platform.accounts(user),/超级管理员/)}
})

test('超级管理员可禁用及启用账号，同时撤销会话并写入审计日志',async()=>{
 const admin=actor('super_admin'),member=actor('member'),f=fixture(admin,member)
 await f.platform.updateAccount(admin,member.id,{status:'disabled'})
 assert.equal(f.users.get(member.id)!.status,'disabled')
 assert.equal(f.users.get(member.id)!.role,'member')
 assert.ok(f.writes.some(write=>write.sql.startsWith('DELETE FROM auth_sessions')&&write.values[0]===member.id))
 assert.ok(f.writes.some(write=>write.sql.startsWith('INSERT INTO audit_logs')))
 await f.platform.updateAccount(admin,member.id,{status:'active'})
 assert.equal(f.users.get(member.id)!.status,'active')
})

test('管理员提交任何角色字段均被拒绝，混合状态请求不能绕过限制',async()=>{
 for(const role of ['member','admin','super_admin']){
  const admin=actor('admin'),target=actor('member'),f=fixture(admin,target)
  await assert.rejects(()=>f.platform.updateAccount(admin,target.id,{role,status:'disabled'}),/超级管理员/)
  assert.equal(f.users.get(target.id)!.role,'member')
  assert.equal(f.users.get(target.id)!.status,'active')
  assert.deepEqual(changes(f.writes),[])
 }
})

test('只有超级管理员可以分配角色',async()=>{
 const owner=actor('super_admin'),target=actor('member'),f=fixture(owner,target)
 await f.platform.updateAccount(owner,target.id,{role:'admin'})
 assert.equal(f.users.get(target.id)!.role,'admin')
})

test('超级管理员仍不能禁用最后一名有效超级管理员',async()=>{
 const owner=actor('super_admin'),f=fixture(owner,owner,1)
 await assert.rejects(()=>f.platform.updateAccount(owner,owner.id,{status:'disabled'}),/至少保留/)
 assert.equal(f.users.get(owner.id)!.status,'active')
 assert.deepEqual(changes(f.writes),[])
})

test('普通管理员不能启停任何账号；旧超管身份在降级后不能查询或修改账号',async()=>{
 const admin=actor('admin'),target=actor('member'),f=fixture(admin,target)
 for(const status of ['active','disabled'])await assert.rejects(()=>f.platform.updateAccount(admin,target.id,{status}),/超级管理员/)
 assert.deepEqual(changes(f.writes),[])
 const stale=actor('super_admin'),degraded=fixture({...stale,role:'admin'})
 await assert.rejects(()=>degraded.platform.accounts(stale),/超级管理员/)
 await assert.rejects(()=>degraded.platform.updateAccount(stale,stale.id,{role:'super_admin'}),/超级管理员/)
 assert.deepEqual(changes(degraded.writes),[])
})

test('有其他有效超管时允许自行降级，并撤销自己的全部会话',async()=>{
 const owner=actor('super_admin'),f=fixture(owner,actor('super_admin'),2)
 assert.equal((await f.platform.accounts(owner))[0]!.isLastSuperAdmin,false)
 await f.platform.updateAccount(owner,owner.id,{role:'member'})
 assert.equal(f.users.get(owner.id)!.role,'member')
 assert.ok(f.writes.some(write=>write.sql.startsWith('DELETE FROM auth_sessions')&&write.values[0]===owner.id))
})

test('最后一名有效超管不能自行降级，禁用的其他超管不计入有效人数',async()=>{
 const owner=actor('super_admin'),f=fixture(owner,{...actor('super_admin'),status:'disabled'},1)
 const accounts=await f.platform.accounts(owner)
 assert.equal(accounts[0]!.isLastSuperAdmin,true)
 assert.equal(accounts[1]!.isLastSuperAdmin,false)
 await assert.rejects(()=>f.platform.updateAccount(owner,owner.id,{role:'member'}),/至少保留/)
 assert.equal(f.users.get(owner.id)!.role,'super_admin')
 assert.deepEqual(changes(f.writes),[])
})

test('已降权的旧身份不能更改账号状态或创建及归档活动',async()=>{
 const stale=actor('admin'),f=fixture({...stale,role:'member'})
 await assert.rejects(()=>f.platform.updateAccount(stale,stale.id,{status:'disabled'}),/管理员/)
 await assert.rejects(()=>f.awards.create(stale),/管理员/)
 await assert.rejects(()=>f.awards.phase(stale,f.campaign.id,'archived',0),/管理员/)
 assert.deepEqual(changes(f.writes),[])
})

test('管理员可创建届次及归档结果，普通成员不能执行',async()=>{
 const admin=actor('admin'),f=fixture(admin)
 assert.equal((await f.awards.create(admin)).edition,3)
 await f.awards.phase(admin,f.campaign.id,'archived',0)
 const archived=f.writes.find(write=>write.sql.startsWith('UPDATE award_campaigns'))
 assert.equal(JSON.parse(String(archived!.values[0])).phase,'archived')
 const member=actor('member'),denied=fixture(member)
 await assert.rejects(()=>denied.awards.create(member),/管理员/)
 await assert.rejects(()=>denied.awards.phase(member,denied.campaign.id,'archived',0),/管理员/)
 assert.deepEqual(changes(denied.writes),[])
})
