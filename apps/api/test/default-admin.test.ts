import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {seedDefaultAdmin} from '../src/default-admin'
import {checkPassword,hashPassword} from '../src/security'
import {schema} from '../src/schema'

test('本地管理员：显式配置才创建，使用随机测试密码，重复初始化保留后续修改',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const c=readConfig();assert.match(c.DB_NAME,/_test$/)
 const databaseName=c.DB_NAME.slice(0,38)+'_'+randomBytes(4).toString('hex')+'_admin_test'
 assert.match(databaseName,/^[a-zA-Z0-9_]{1,64}$/)
 const setup=new Database(c)
 try{await setup.pool.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4`)}finally{await setup.pool.end()}
 const db=new Database({...c,DB_NAME:databaseName}),password=randomBytes(24).toString('base64url')
 try{
  for(const sql of schema)await db.execute(sql)
  assert.equal((await seedDefaultAdmin(db)).id,null)
  assert.equal((await db.rows('SELECT id FROM users')).length,0)
  await assert.rejects(()=>seedDefaultAdmin(db,'too-short'),/12–128/)
  const seeded=await seedDefaultAdmin(db,password)
  const original=(await db.rows<{id:string,password_hash:string,role:string,status:string}>("SELECT id,password_hash,role,status FROM users WHERE username_key='admin'"))[0]!
  assert.equal(seeded.created,true);assert.equal(seeded.id,original.id);assert.equal(original.role,'super_admin');assert.equal(original.status,'active')
  assert.equal(await checkPassword(password,original.password_hash),true)
  const changedHash=await hashPassword(randomBytes(24).toString('base64url'))
  await db.execute("UPDATE users SET password_hash=?,nickname=?,role='admin',status='disabled' WHERE id=?",[changedHash,'已修改昵称',original.id])
  const repeated=await Promise.all([seedDefaultAdmin(db,password),seedDefaultAdmin(db)])
  assert.ok(repeated.every(r=>!r.created&&r.id===original.id))
  assert.deepEqual(await db.rows("SELECT id,password_hash,nickname,role,status FROM users WHERE username_key='admin'"),[{id:original.id,password_hash:changedHash,nickname:'已修改昵称',role:'admin',status:'disabled'}])
 }finally{await db.pool.end()}
})
