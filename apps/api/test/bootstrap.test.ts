import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import type {Database} from '../src/database'
import {Platform,type Actor} from '../src/platform'

type Candidate=Actor & {email_verified_at:number|null}
// Database boundary stub: rejected candidates are deliberately returned so the
// bootstrap service must validate verification and status before granting access.
function fixture(candidate:Candidate|undefined,existingOwner=false){
 const writes:{sql:string,values:unknown[]}[]=[],lookups:unknown[][]=[]
 const tx={}
 const db={
  transaction:async<T>(run:(connection:unknown)=>Promise<T>)=>run(tx),
  rows:async(sql:string,values:unknown[]=[])=>{
   if(sql.includes('system_locks'))return []
   if(sql.includes("role='super_admin'"))return existingOwner?[{id:randomUUID()}]:[]
   lookups.push(values)
   return candidate?[candidate]:[]
  },
  execute:async(sql:string,values:unknown[]=[])=>{writes.push({sql,values})},
 } as unknown as Database
 return {platform:new Platform(db),writes,lookups}
}
const verified=():Candidate=>({id:randomUUID(),nickname:'测试成员',role:'member',status:'active',email_verified_at:Date.now()})
const grants=(writes:{sql:string}[])=>writes.filter(w=>!w.sql.includes('system_locks'))

test('首名管理员引导：只提升已验证成员，撤销会话并留下审计记录',async()=>{
 const user=verified(),{platform,writes,lookups}=fixture(user)
 await platform.bootstrap('  Verified@Example.com  ')
 assert.deepEqual(lookups,[['verified@example.com']])
 const changes=grants(writes)
 assert.equal(changes.length,3)
 assert.match(changes[0]!.sql,/UPDATE users SET role='super_admin'/)
 assert.deepEqual(changes[0]!.values,[user.id])
 assert.match(changes[1]!.sql,/DELETE FROM auth_sessions/)
 assert.deepEqual(changes[1]!.values,[user.id])
 assert.match(changes[2]!.sql,/INSERT INTO audit_logs/)
 assert.equal(changes[2]!.values[1],user.id)
})

test('首名管理员引导：已有有效超管时拒绝提升其他账号',async()=>{
 const {platform,writes,lookups}=fixture(verified(),true)
 await assert.rejects(()=>platform.bootstrap('verified@example.com'),/已经存在超级管理员/)
 assert.equal(lookups.length,0)
 assert.deepEqual(grants(writes),[])
})

for(const [label,candidate] of [
 ['账号不存在',undefined],
 ['邮箱未验证',{...verified(),email_verified_at:null}],
 ['旧占位验证时间为零',{...verified(),email_verified_at:0}],
 ['验证时间无效',{...verified(),email_verified_at:NaN}],
 ['账号已禁用',{...verified(),status:'disabled'}],
 ['账号已注销',{...verified(),status:'deleted'}],
] as const){
 test(`首名管理员引导拒绝：${label}`,async()=>{
  const {platform,writes}=fixture(candidate)
  await assert.rejects(()=>platform.bootstrap('verified@example.com'),/请先完成该邮箱的注册/)
  assert.deepEqual(grants(writes),[])
 })
}
