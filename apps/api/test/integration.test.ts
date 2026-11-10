import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { schema } from '../src/schema'
import { Auth } from '../src/auth'
import { Mailer } from '../src/mail'

test('MySQL：注册、错误码锁定、并发消费、角色、登录、找回密码与会话撤销', {skip:process.env.AUTH_INTEGRATION!=='1'}, async()=>{
 const c=readConfig();assert.match(c.DB_NAME,/_test$/);assert.equal(c.MAIL_TRANSPORT,'capture')
 const db=new Database(c),auth=new Auth(db,c,new Mailer(c)),email=`test-${randomUUID()}@example.com`,pw='test passphrase 123456',username=`u_${randomUUID().replace(/-/g,'').slice(0,20)}`
 const code=async(id:string)=>{const mail=JSON.parse(await readFile(`.data/mail/${id}.json`,'utf8'));return mail.text.match(/\d{6}/)[0] as string}
 try{
  for(const sql of schema)await db.execute(sql);await auth.initialize()
  const first=await auth.requestCode(email,'registration','test-ip-1'),value=await code(first.challengeId)
  await assert.rejects(()=>auth.requestCode(email,'registration','test-ip-1'),/60/)
  await assert.rejects(()=>auth.complete({email,challengeId:first.challengeId,code:value,password:pw,confirmPassword:pw+'mismatch',username},'registration','test-ip-1'),/不一致/)
  await assert.rejects(()=>auth.complete({email,challengeId:first.challengeId,code:value==='000000'?'000001':'000000',password:pw,confirmPassword:pw,username},'registration','test-ip-1'))
  assert.equal((await db.rows<{failed_attempts:number}>('SELECT failed_attempts FROM email_verification_challenges WHERE id=?',[first.challengeId]))[0]!.failed_attempts,1)
  const input={email,challengeId:first.challengeId,code:value,password:pw,confirmPassword:pw,username}
  const results=await Promise.allSettled([auth.complete(input,'registration','test-ip-1'),auth.complete(input,'registration','test-ip-1')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((await db.rows<{n:number}>('SELECT COUNT(*) n FROM users WHERE email_key=?',[email]))[0]!.n,1)
  await assert.rejects(()=>auth.login(username,'wrong','test-ip-2'),/账号或密码/)
  const emailSession=await auth.login(' '+email.toUpperCase()+' ',pw,'test-ip-2');assert.equal(emailSession.user.username,username)
  const session=await auth.login(username.toUpperCase(),pw,'test-ip-2');assert.equal(session.user.username,username);assert.equal(session.user.nickname,username);assert.equal(session.user.role,'member');assert.equal((await auth.session(session.session)).id,session.user.id)
  await auth.updateNickname(await auth.session(session.session),'新的展示昵称');assert.equal((await auth.session(session.session)).nickname,'新的展示昵称')
  await assert.rejects(()=>auth.login('新的展示昵称',pw,'test-ip-2'),/账号或密码/)
  await assert.rejects(()=>auth.logout(session.session,'bad'),/校验/)
  await db.execute('UPDATE email_verification_challenges SET created_at=created_at-61000 WHERE email_key=?',[email])
  const reset=await auth.requestCode(email,'reset','test-ip-3'),resetCode=await code(reset.challengeId)
  await assert.rejects(()=>auth.complete({email,challengeId:reset.challengeId,code:resetCode,password:pw,confirmPassword:pw,username},'registration','test-ip-3'))
  await auth.complete({email,challengeId:reset.challengeId,code:resetCode,password:pw+'new',confirmPassword:pw+'new'},'reset','test-ip-3')
  await assert.rejects(()=>auth.session(session.session),/过期/);await assert.rejects(()=>auth.session(emailSession.session),/过期/);await assert.rejects(()=>auth.login(username,pw,'test-ip-4'))
  const newSession=await auth.login(username,pw+'new','test-ip-4');await auth.logout(newSession.session,newSession.csrf);await assert.rejects(()=>auth.session(newSession.session))
  const another=`test-${randomUUID()}@example.com`,challenge=await auth.requestCode(another,'registration','test-ip-5'),right=await code(challenge.challengeId)
  for(let i=0;i<5;i++)await assert.rejects(()=>auth.complete({email:another,challengeId:challenge.challengeId,code:right==='000000'?'000001':'000000',password:pw,confirmPassword:pw,username:username+'x'},'registration','test-ip-5'))
  await assert.rejects(()=>auth.complete({email:another,challengeId:challenge.challengeId,code:right,password:pw,confirmPassword:pw,username:username+'x'},'registration','test-ip-5'))
  await assert.rejects(()=>auth.session('made-up-token'))
 }finally{await db.pool.end()}
})
