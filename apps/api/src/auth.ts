import { HttpException } from '@nestjs/common'
import { randomInt,randomUUID } from 'node:crypto'
import type { PoolConnection } from 'mysql2/promise'
import type { Config } from './config'
import { Database } from './database'
import { Mailer,smtpDiagnostic } from './mail'
import { checkPassword,digest,emailKey,equal,hashPassword,mac,token } from './security'
import {usernameKey,validUsername} from './identity'
type User={id:string,email:string,username:string,nickname:string,signature?:string,avatar_asset_id?:string|null,password_hash:string,role:string,status:string}
export type ProfilePatch={nickname?:string,signature?:string,avatarAssetId?:string|null}
type Challenge={id:string,email_key:string,purpose:string,code_hmac:string,expires_at:number,failed_attempts:number,consumed_at:number|null,delivery_status:string}
const fail=(message='验证码无效、已使用或已过期。',status=422)=>new HttpException(message,status)
export class Auth {
  private dummyHash=''
  constructor(readonly db:Database,private c:Config,private mail:Mailer){}
  async initialize(){this.dummyHash=await hashPassword(token())}
  async limit(scope:string,subject:string,max:number,windowMs:number){
    const now=Date.now(),start=Math.floor(now/windowMs)*windowMs,key=mac(this.c.AUTH_SECRET,`${scope}:${subject}:${start}`)
    const hits=await this.db.transaction(async tx=>{await this.db.execute('INSERT INTO auth_rate_limits(bucket_key,hits,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1',[key,start+windowMs],tx);return (await this.db.rows<{hits:number}>('SELECT hits FROM auth_rate_limits WHERE bucket_key=?',[key],tx))[0]!.hits})
    if(hits>max)throw fail('请求过于频繁，请稍后再试。',429)
  }
  private async lockEmail(key:string,tx:PoolConnection){await this.db.execute('INSERT IGNORE INTO auth_email_locks(email_key) VALUES (?)',[key],tx);await this.db.rows('SELECT email_key FROM auth_email_locks WHERE email_key=? FOR UPDATE',[key],tx)}
  async requestCode(email:string,purpose:'registration'|'reset',ip:string){
    const key=emailKey(email),id=randomUUID(),now=Date.now(),code=String(randomInt(0,1000000)).padStart(6,'0')
    await this.limit('mail-ip-minute',ip,10,60000);await this.limit('mail-ip-day',ip,100,86400000);await this.limit('mail-email-day',key,10,86400000)
    await this.db.transaction(async tx=>{
      await this.lockEmail(key,tx)
      const recent=await this.db.rows('SELECT id FROM email_verification_challenges WHERE email_key=? AND created_at>? LIMIT 1',[key,now-60000],tx)
      if(recent.length)throw fail('请等待 60 秒后再请求验证码。',429)
      await this.db.execute('INSERT INTO email_verification_challenges(id,email_key,purpose,code_hmac,expires_at,delivery_status,created_at) VALUES (?,?,?,?,?,?,?)',[id,key,purpose,mac(this.c.AUTH_SECRET,`${id}:${key}:${purpose}:${code}`),now+300000,'pending',now],tx)
    })
    const user=(await this.db.rows<User>('SELECT * FROM users WHERE email_key=?',[key]))[0]
    const eligible=purpose==='registration'?!user:!!user && user.status==='active'
    // Uniform response for existing/non-existing accounts; no public code or delivery-status endpoint.
    try{
      if(eligible)await this.mail.send(id,email.trim(),code,purpose)
      await this.db.transaction(async tx=>{
        await this.lockEmail(key,tx)
        // Slow older deliveries must not supersede a newer request.
        const newer=await this.db.rows('SELECT id FROM email_verification_challenges WHERE email_key=? AND purpose=? AND created_at>? LIMIT 1',[key,purpose,now],tx)
        await this.db.execute('UPDATE email_verification_challenges SET delivery_status=?,consumed_at=? WHERE id=?',[eligible?'sent':'failed',newer.length?Date.now():null,id],tx)
        if(eligible&&!newer.length)await this.db.execute('UPDATE email_verification_challenges SET consumed_at=? WHERE email_key=? AND purpose=? AND id<>? AND created_at<=? AND consumed_at IS NULL',[Date.now(),key,purpose,id,now],tx)
      })
    }catch(cause){
      await this.db.execute("UPDATE email_verification_challenges SET delivery_status='failed' WHERE id=?",[id])
      // Delivery failure does not expose account existence; operators inspect SMTP health separately.
      console.error('Mail delivery failed for challenge',id,smtpDiagnostic(cause))
    }
    return {challengeId:id,retryAfter:60,message:'如该邮箱符合条件，验证码将发送至邮箱。请检查收件箱和垃圾邮件，未收到可稍后重试。'}
  }
  private async verify(tx:PoolConnection,id:string,key:string,purpose:string,code:string){
    const challenge=(await this.db.rows<Challenge>('SELECT * FROM email_verification_challenges WHERE id=? FOR UPDATE',[id],tx))[0]
    if(!challenge || challenge.email_key!==key || challenge.purpose!==purpose || challenge.delivery_status!=='sent' || challenge.consumed_at!==null || Number(challenge.expires_at)<=Date.now() || challenge.failed_attempts>=5)return false
    if(!equal(challenge.code_hmac,mac(this.c.AUTH_SECRET,`${id}:${key}:${purpose}:${code}`))){await this.db.execute('UPDATE email_verification_challenges SET failed_attempts=failed_attempts+1 WHERE id=?',[id],tx);return false}
    return true
  }
  async complete(input:{challengeId:string,email:string,code:string,password:string,confirmPassword:string,username?:string},purpose:'registration'|'reset',ip:string){
    if(input.password!==input.confirmPassword)throw fail('两次输入的密码不一致。',422)
    if(purpose==='registration'&&(!input.username||!validUsername(input.username)))throw fail('用户名需为 3–24 位中文、字母、数字或下划线。',422)
    const key=emailKey(input.email)
    await this.limit('verify-ip',ip,20,60000);await this.limit('verify-email',key,10,60000)
    const passwordHash=await hashPassword(input.password)
    // Returning failure (rather than throwing inside the transaction) persists wrong-code attempt counts.
    const success=await this.db.transaction(async tx=>{
      await this.lockEmail(key,tx)
      if(!await this.verify(tx,input.challengeId,key,purpose,input.code))return false
      const user=(await this.db.rows<User>('SELECT * FROM users WHERE email_key=? FOR UPDATE',[key],tx))[0]
      if(purpose==='registration'){
        if(user)return false
        if((await this.db.rows('SELECT id FROM users WHERE username_key=?',[usernameKey(input.username!)],tx)).length)throw fail('该用户名已被使用。',409)
        try{await this.db.execute('INSERT INTO users(id,email,email_key,username,username_key,nickname,password_hash,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[randomUUID(),input.email.trim(),key,input.username!.trim(),usernameKey(input.username!),input.username!.trim(),passwordHash,Date.now(),Date.now()],tx)}catch(error){if((error as {code?:string}).code==='ER_DUP_ENTRY')throw fail('用户名或邮箱已被使用。',409);throw error}
      }else{
        if(!user || user.status!=='active')return false
        await this.db.execute('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,user.id],tx)
        await this.db.execute('DELETE FROM auth_sessions WHERE user_id=?',[user.id],tx)
      }
      await this.db.execute('UPDATE email_verification_challenges SET consumed_at=? WHERE email_key=? AND purpose=? AND consumed_at IS NULL',[Date.now(),key,purpose],tx)
      return true
    })
    if(!success)throw fail()
    return {message:purpose==='registration'?'注册成功，请使用用户名或邮箱登录。':'密码已更新，请重新登录。'}
  }
  async login(identifier:string,password:string,ip:string,oldToken?:string){
    // Usernames cannot contain @. Email matching must preserve dots and + tags.
    const byEmail=identifier.includes('@'),key=byEmail?emailKey(identifier):usernameKey(identifier)
    await this.limit('login-ip',ip,30,60000);await this.limit(byEmail?'login-email':'login-username',key,10,600000)
    const user=(await this.db.rows<User>(byEmail?'SELECT * FROM users WHERE email_key=?':'SELECT * FROM users WHERE username_key=?',[key]))[0]
    // Both login names share the same account budget, including failed passwords.
    if(user)await this.limit('login-account',user.id,10,600000)
    const matches=await checkPassword(password,user?.password_hash||this.dummyHash)
    if(!user||!matches||user.status!=='active')throw fail('账号或密码错误，或账号不可用。',401)
    const session=token(),csrf=mac(this.c.AUTH_SECRET,`csrf:${session}`),expires=Date.now()+7*86400000
    await this.db.transaction(async tx=>{
      const fresh=(await this.db.rows<User>('SELECT * FROM users WHERE id=? FOR UPDATE',[user.id],tx))[0]
      if(!fresh||fresh.status!=='active'||fresh.password_hash!==user.password_hash)throw fail('请重新登录。',401)
      if(oldToken)await this.db.execute('DELETE FROM auth_sessions WHERE token_hash=?',[digest(oldToken)],tx)
      await this.db.execute('INSERT INTO auth_sessions(token_hash,user_id,csrf_hash,expires_at,created_at) VALUES (?,?,?,?,?)',[digest(session),user.id,digest(csrf),expires,Date.now()],tx)
    })
    return {session,csrf,expires,user:this.publicUser(user)}
  }
  async session(raw:string|undefined){
    if(!raw||raw.length>200)throw fail('请先登录。',401)
    const row=(await this.db.rows<User & {csrf_hash:string}>('SELECT u.*,s.csrf_hash FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status=\'active\'',[digest(raw),Date.now()]))[0]
    if(!row)throw fail('登录已过期，请重新登录。',401)
    return row
  }
  async bootstrap(raw:string|undefined){
    const user=await this.session(raw)
    const csrf=mac(this.c.AUTH_SECRET,`csrf:${raw}`)
    // Read-only bootstrap. Legacy sessions obtain their token through the
    // existing POST endpoint; a page render must not mutate another tab's CSRF.
    return {user:this.publicUser(user),csrfToken:equal(digest(csrf),user.csrf_hash)?csrf:null}
  }
  publicUser(user:User){return {id:user.id,username:user.username,email:user.email,nickname:user.nickname,role:user.role,signature:user.signature||'',avatarAssetId:user.avatar_asset_id||null,avatarUrl:user.avatar_asset_id?'/api/assets/'+user.avatar_asset_id:null}}
  async updateProfile(user:User,patch:ProfilePatch){
    return this.db.transaction(async tx=>{
      const current=(await this.db.rows<User>('SELECT * FROM users WHERE id=? FOR UPDATE',[user.id],tx))[0]
      if(!current||current.status!=='active')throw fail('账号不可用。',403)
      if(patch.avatarAssetId){
        const asset=await this.db.rows("SELECT id FROM assets WHERE id=? AND user_id=? AND status='active' FOR UPDATE",[patch.avatarAssetId,user.id],tx)
        if(!asset.length)throw fail('请选择自己上传的有效图片。',422)
      }
      const fields:string[]=[],values:(string|null)[]=[]
      if(patch.nickname!==undefined){fields.push('nickname=?');values.push(patch.nickname)}
      if(patch.signature!==undefined){fields.push('signature=?');values.push(patch.signature)}
      if(patch.avatarAssetId!==undefined){fields.push('avatar_asset_id=?');values.push(patch.avatarAssetId)}
      if(fields.length)await this.db.execute(`UPDATE users SET ${fields.join(',')} WHERE id=?`,[...values,user.id],tx)
      const updated=(await this.db.rows<User>('SELECT * FROM users WHERE id=?',[user.id],tx))[0]!
      return {user:this.publicUser(updated)}
    })
  }
  async updateNickname(user:User,nickname:string){return this.updateProfile(user,{nickname})}
  async logout(raw:string,csrf:string){const session=await this.session(raw);if(!equal(digest(csrf),session.csrf_hash))throw fail('请求校验失败。',403);await this.db.execute('DELETE FROM auth_sessions WHERE token_hash=?',[digest(raw)]);return {message:'已退出登录。'}}
  async refreshCsrf(raw:string){await this.session(raw);const csrf=mac(this.c.AUTH_SECRET,`csrf:${raw}`);await this.db.execute('UPDATE auth_sessions SET csrf_hash=? WHERE token_hash=?',[digest(csrf),digest(raw)]);return {csrfToken:csrf}}
}
