import {randomUUID} from 'node:crypto'
import {Database} from './database'
import {Platform} from './platform'
import {hashPassword} from './security'

// Local development only: migration supplies an optional password from private config.
export async function seedDefaultAdmin(db:Database,initialPassword?:string){
 const platform=new Platform(db)
 return db.transaction(async tx=>{
  await platform.lock('account-roles',tx)
  const existing=await db.rows<{id:string}>('SELECT id FROM users WHERE username_key=? FOR UPDATE',['admin'],tx)
  if(existing.length)return {created:false,id:existing[0]!.id}
  if(!initialPassword)return {created:false,id:null}
  if(initialPassword.length<12||initialPassword.length>128)throw new Error('Development administrator password must contain 12–128 characters.')
  const initialPasswordHash=await hashPassword(initialPassword)
  const email='admin@localhost.invalid'
  if((await db.rows('SELECT id FROM users WHERE email_key=?',[email],tx)).length)throw new Error('Default administrator email is already occupied; no existing account was changed.')
  const id=randomUUID(),now=Date.now()
  await db.execute('INSERT INTO users(id,email,email_key,username,username_key,nickname,password_hash,role,status,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[id,email,email,'admin','admin','管理员',initialPasswordHash,'super_admin','active',0,now],tx)
  await platform.audit({id,nickname:'管理员',role:'super_admin',status:'active'},'初始化本地默认超级管理员',null,tx)
  return {created:true,id}
 })
}
