import { HttpException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import { Database } from './database'
export type Actor={id:string,nickname:string,role:string,status:string}
export const reject=(message:string,status=409)=>new HttpException(message,status)
export function staff(actor:Actor){if(!['admin','super_admin'].includes(actor.role))throw reject('需要管理员权限。',403)}
export function owner(actor:Actor){if(actor.role!=='super_admin')throw reject('需要超级管理员权限。',403)}
export class Platform {
 constructor(readonly db:Database){}
 async lock(name:string,tx:PoolConnection){await this.db.execute('INSERT IGNORE INTO system_locks(id) VALUES (?)',[name],tx);await this.db.rows('SELECT id FROM system_locks WHERE id=? FOR UPDATE',[name],tx)}
 async actor(id:string,tx?:PoolConnection){const user=(await this.db.rows<Actor>('SELECT id,nickname,role,status FROM users WHERE id=? FOR UPDATE',[id],tx))[0];if(!user||user.status!=='active')throw reject('账号不可用。',403);return user}
 async audit(actor:Actor,action:string,campaignId:string|null=null,tx?:PoolConnection){await this.db.execute('INSERT INTO audit_logs(id,actor_id,actor,campaign_id,action,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),actor.id,actor.nickname,campaignId,action,Date.now()],tx)}
 async accounts(actor:Actor){owner(actor);return this.db.rows('SELECT id,username,nickname AS name,role,status FROM users ORDER BY created_at LIMIT 500')}
 async updateAccount(actor:Actor,id:string,patch:{role?:string,status?:string}){return this.db.transaction(async tx=>{
  await this.lock('account-roles',tx);owner(await this.actor(actor.id,tx))
  const target=(await this.db.rows<Actor>('SELECT id,nickname,role,status FROM users WHERE id=? FOR UPDATE',[id],tx))[0];if(!target)throw reject('账号不存在。',404)
  if(target.status==='deleted')throw reject('已注销的账号不能恢复或调整权限。')
  const role=patch.role||target.role,status=patch.status||target.status
  if(target.role==='super_admin'&&target.status==='active'&&(role!=='super_admin'||status!=='active')){const [count]=await this.db.rows<{n:number}>("SELECT COUNT(*) n FROM users WHERE role='super_admin' AND status='active'",[],tx);if(count!.n<=1)throw reject('至少保留一名有效的超级管理员。')}
  await this.db.execute('UPDATE users SET role=?,status=? WHERE id=?',[role,status,id],tx);await this.db.execute('DELETE FROM auth_sessions WHERE user_id=?',[id],tx);await this.audit(actor,`调整账号 ${target.nickname}：${role} / ${status}`,null,tx)
  return {message:'账号已更新，受影响账号需重新登录。'}
 })}
 async bootstrap(email:string){return this.db.transaction(async tx=>{await this.lock('account-roles',tx);if((await this.db.rows("SELECT id FROM users WHERE role='super_admin' AND status='active'",[],tx)).length)throw reject('已经存在超级管理员，请使用权限管理界面。');const user=(await this.db.rows<Actor>('SELECT id,nickname,role,status FROM users WHERE email_key=? AND email_verified_at IS NOT NULL FOR UPDATE',[email.trim().toLowerCase()],tx))[0];if(!user||user.status!=='active')throw reject('请先完成该邮箱的注册。');await this.db.execute("UPDATE users SET role='super_admin' WHERE id=?",[user.id],tx);await this.db.execute('DELETE FROM auth_sessions WHERE user_id=?',[user.id],tx);await this.audit(user,'本机引导：创建首名超级管理员',null,tx)})}
}
