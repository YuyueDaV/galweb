import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {schema} from '../src/schema'
import {Platform,type Actor} from '../src/platform'
import {Forum} from '../src/forum'
import {hashPassword} from '../src/security'
test('步骤 1–2：服务端角色保护、论坛发布回复、跨用户收藏与持久化',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const config=readConfig();assert.match(config.DB_NAME,/_test$/);const db=new Database(config),platform=new Platform(db),forum=new Forum(db,platform)
 try{
  for(const sql of schema)await db.execute(sql)
  const password=await hashPassword('workflow test passphrase'),actors:Actor[]=[]
  for(const role of ['super_admin','admin','member','member']){const id=randomUUID();await db.execute('INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)',[id,id+'@example.com',id+'@example.com',role,password,role,Date.now(),Date.now()]);actors.push({id,nickname:role,role,status:'active'})}
  const [owner,admin,member,other]=actors as [Actor,Actor,Actor,Actor]
  const otherOwners=await db.rows<{id:string}>("SELECT id FROM users WHERE role='super_admin' AND id<>?",[owner.id])
  try{await db.execute("UPDATE users SET role='admin' WHERE role='super_admin' AND id<>?",[owner.id]);await assert.rejects(()=>platform.updateAccount(owner,owner.id,{role:'member'}),/至少保留/);await assert.rejects(()=>platform.updateAccount(owner,owner.id,{status:'disabled'}),/至少保留/)}finally{for(const account of otherOwners)await db.execute("UPDATE users SET role='super_admin' WHERE id=?",[account.id])}
  await assert.rejects(()=>platform.accounts(member),/超级管理员/)
  await assert.rejects(()=>platform.updateAccount(admin,member.id,{role:'admin'}),/超级管理员/)
  await platform.updateAccount(owner,other.id,{role:'admin'});assert.equal((await db.rows<{role:string}>('SELECT role FROM users WHERE id=?',[other.id]))[0]!.role,'admin')
  const post=await forum.create(member,{title:'这是一篇真实测试帖子',content:'在不同账号之间测试数据库持久化与权限。',category:'作品讨论',spoiler:false})
  assert.equal((await forum.detail(post.id)).author,'member')
  await forum.reply(other,post.id,'另一位用户的回复。');assert.equal((await forum.replies(post.id)).length,1)
  const firstReply=(await forum.replies(post.id))[0] as {id:string};await forum.moderateReply(admin,firstReply.id,'hidden');assert.equal((await forum.replies(post.id)).length,0);await forum.moderateReply(admin,firstReply.id,'published')
  await Promise.all([forum.reaction(member,post.id,'bookmark',true),forum.reaction(member,post.id,'bookmark',true)])
  assert.deepEqual((await forum.mine(member)).bookmarks,[post.id]);assert.deepEqual((await forum.mine(other)).bookmarks,[])
  await assert.rejects(()=>forum.edit(other,post.id,{title:'越权编辑别人的帖子'}),/管理员/)
  await forum.edit(member,post.id,{title:'作者修改后的帖子标题'});await forum.edit(admin,post.id,{pinned:true,featured:true})
  assert.equal((await forum.list({page:1,limit:30,q:'作者修改'})).items[0]!.title,'作者修改后的帖子标题')
  await forum.edit(admin,post.id,{status:'hidden'});await assert.rejects(()=>forum.detail(post.id),/不存在/)
  await forum.edit(admin,post.id,{status:'published'});assert.equal((await forum.detail(post.id)).replies,1)
  const secondDb=new Database(config);try{assert.equal((await new Forum(secondDb,new Platform(secondDb)).detail(post.id)).title,'作者修改后的帖子标题')}finally{await secondDb.pool.end()}
 }finally{await db.pool.end()}
})
