import {Database} from './database'
import {Platform,reject,type Actor} from './platform'
import {checkPassword} from './security'
import {decode} from './forum'
import type {AwardNomination,AwardResult} from './award-types'

const anonymous='已注销用户'
type Account={id:string,email_key:string,password_hash:string,status:string,role:string}

export class AccountDeletion {
 constructor(private db:Database,private platform:Platform){}
 async remove(actor:Actor,password:string){
  const account=(await this.db.rows<Account>('SELECT id,email_key,password_hash,status,role FROM users WHERE id=?',[actor.id]))[0]
  if(!account||account.status!=='active')throw reject('账号不可用，请重新登录。',401)
  if(!await checkPassword(password,account.password_hash))throw reject('当前密码不正确。',422)
  return this.db.transaction(async tx=>{
   // Lock order matches role changes, email verification, and award mutations.
   await this.platform.lock('account-roles',tx)
   await this.platform.lock(`account:${actor.id}`,tx)
   await this.db.execute('INSERT IGNORE INTO auth_email_locks(email_key) VALUES (?)',[account.email_key],tx)
   await this.db.rows('SELECT email_key FROM auth_email_locks WHERE email_key=? FOR UPDATE',[account.email_key],tx)
   const campaigns=await this.db.rows<{campaign_id:string}>('SELECT campaign_id FROM award_nominations WHERE user_id=? UNION SELECT campaign_id FROM award_ballots WHERE user_id=?',[actor.id,actor.id],tx)
   for(const id of campaigns.map(c=>c.campaign_id).sort())await this.platform.lock(`campaign:${id}`,tx)
   const fresh=(await this.db.rows<Account>('SELECT id,email_key,password_hash,status,role FROM users WHERE id=? FOR UPDATE',[actor.id],tx))[0]
   if(!fresh||fresh.status!=='active'||fresh.password_hash!==account.password_hash||fresh.email_key!==account.email_key)throw reject('账号状态已变化，请重新登录后再操作。',401)
   if(fresh.role==='super_admin'){
    const count=(await this.db.rows<{n:number}>("SELECT COUNT(*) n FROM users WHERE role='super_admin' AND status='active'",[],tx))[0]!
    if(count.n<=1)throw reject('最后一名有效超级管理员不能注销，请先将管理职责交接给另一位超级管理员。')
   }
   const now=Date.now(),placeholder=actor.id+'@deleted.invalid'
   await this.db.execute("UPDATE users SET email=?,email_key=?,username=NULL,username_key=NULL,nickname=?,password_hash='',signature='',avatar_asset_id=NULL,role='member',status='deleted',deleted_at=?,email_verified_at=0 WHERE id=?",[placeholder,placeholder,anonymous,now,actor.id],tx)
   await this.db.execute('DELETE FROM auth_sessions WHERE user_id=?',[actor.id],tx)
   // Retain short-lived challenge timestamps and rate buckets to preserve mail limits.
   await this.db.execute("UPDATE email_verification_challenges SET consumed_at=?,code_hmac='',delivery_status='failed' WHERE email_key=?",[now,account.email_key],tx)
   await this.db.execute('DELETE FROM forum_reactions WHERE user_id=?',[actor.id],tx)
   await this.db.execute('DELETE FROM forum_drafts WHERE user_id=?',[actor.id],tx)
   await this.db.execute('DELETE FROM notifications WHERE user_id=?',[actor.id],tx)
   await this.db.execute("UPDATE notifications n JOIN forum_replies r ON r.id=n.reply_id SET n.title='一位已注销的同好回复了你的讨论。' WHERE r.user_id=?",[actor.id],tx)
   await this.db.execute('DELETE FROM user_library WHERE user_id=?',[actor.id],tx)
   await this.db.execute("UPDATE forum_posts SET data=JSON_SET(JSON_REMOVE(data,'$.uploadedImage'),'$.author',?,'$.avatar',?) WHERE user_id=?",[anonymous,'已',actor.id],tx)
   await this.db.execute("UPDATE assets SET status='hidden' WHERE user_id=?",[actor.id],tx)
   await this.db.execute('DELETE FROM award_ballots WHERE user_id=?',[actor.id],tx)
   const nominations=await this.db.rows<{id:string,data:AwardNomination|string}>('SELECT id,data FROM award_nominations WHERE user_id=? FOR UPDATE',[actor.id],tx)
   for(const row of nominations){const n=decode(row.data);n.accountId='';n.accountName=anonymous;if(n.status==='pending')n.status='withdrawn';await this.db.execute('UPDATE award_nominations SET status=?,data=? WHERE id=?',[n.status,JSON.stringify(n),row.id],tx)}
   for(const campaign of campaigns){
    const snapshot=(await this.db.rows<{data:{results:AwardResult[],ballotCount:number}|string}>('SELECT data FROM award_results WHERE campaign_id=? FOR UPDATE',[campaign.campaign_id],tx))[0]
    if(!snapshot)continue
    const data=decode(snapshot.data)
    for(const result of data.results)for(const n of result.nominations)if(n.accountId===actor.id){n.accountId='';n.accountName=anonymous}
    await this.db.execute('UPDATE award_results SET data=? WHERE campaign_id=?',[JSON.stringify(data),campaign.campaign_id],tx)
   }
   await this.db.execute('UPDATE audit_logs SET actor=? WHERE actor_id=?',[anonymous,actor.id],tx)
   await this.platform.audit({id:actor.id,nickname:anonymous,role:'member',status:'deleted'},'用户主动注销账号',null,tx)
   return {message:'账号已注销，用户名和邮箱可重新注册。发码频率限制仍然有效。'}
  })
 }
}
