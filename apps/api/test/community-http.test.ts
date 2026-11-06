import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomUUID,randomBytes} from 'node:crypto'
import {Database} from '../src/database'
import {readConfig} from '../src/config'
import {schema} from '../src/schema'
import {hashPassword} from '../src/security'

test('社区 HTTP：认证、CSRF、字段白名单、草稿、书单及管理员配置',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const config=readConfig();assert.match(config.DB_NAME,/_test$/);const db=new Database(config),password=randomBytes(24).toString('base64url'),username='u_'+randomUUID().slice(0,18),userId=randomUUID(),email=userId+'@example.com'
 for(const sql of schema)await db.execute(sql)
 await db.execute('INSERT INTO users(id,email,email_key,username,username_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[userId,email,email,username,username,'HTTP 同好',await hashPassword(password),'member',Date.now(),Date.now()])
 const child=spawn(process.execPath,['dist/main.js'],{env:{...process.env,API_PORT:'3298',WEB_ORIGIN:'http://127.0.0.1:3100',MAIL_TRANSPORT:'capture'},stdio:'ignore'}),base='http://127.0.0.1:3298',origin='http://127.0.0.1:3100'
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}assert.ok(ready)
  for(const path of ['/forum/draft','/notifications','/library'])assert.equal((await fetch(base+'/api'+path)).status,401)
  const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})}),identity=await login.json() as {csrfToken:string},cookie=login.headers.get('set-cookie')!.split(';')[0]!
  const request=(path:string,body:unknown,csrf=true,method='PUT')=>fetch(base+'/api'+path,{method,headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':identity.csrfToken}:{})},body:JSON.stringify(body)})
  const draft={title:'HTTP 测试草稿',content:'尚未发布的正文。',category:'作品讨论',spoiler:false,workId:null,assetIds:[]}
  assert.equal((await request('/forum/draft',draft,false)).status,403)
  assert.equal((await request('/forum/draft',{...draft,userId:randomUUID()})).status,422)
  assert.equal((await request('/forum/draft',draft)).status,200)
  const restored=await (await fetch(base+'/api/forum/draft',{headers:{Cookie:cookie}})).json() as {draft:{data:typeof draft}};assert.equal(restored.draft.data.content,draft.content)
  assert.equal((await request('/admin/site-settings',{title:'越权配置',description:'',announcement:'',joinInfo:'',contact:'',links:[],version:0})).status,403)
  const profile=await (await fetch(base+'/api/users/'+userId)).json() as Record<string,unknown>;assert.equal(profile.nickname,'HTTP 同好');assert.ok(!('email' in profile));assert.ok(!('password_hash' in profile))
  const created=await request('/posts',{title:'HTTP 编辑器测试帖子',content:'## 公开标题\n\n:::spoiler\n秘密结局\n:::',category:'作品讨论',spoiler:false,format:'markdown',assetIds:[]},true,'POST');assert.equal(created.status,201)
  const postId=(await created.json() as {id:string}).id,post=await (await fetch(base+'/api/posts/'+postId)).json() as {body:string,excerpt:string,format:string};assert.equal(post.format,'markdown');assert.match(post.body,/秘密结局/);assert.doesNotMatch(post.excerpt,/秘密结局/)
  assert.deepEqual(await (await fetch(base+'/api/forum/draft',{headers:{Cookie:cookie}})).json(),{draft:null})
  assert.equal((await request('/posts/'+postId+'/replies',{content:'跨帖回复',parentId:randomUUID()},true,'POST')).status,422)
 }finally{child.kill();await new Promise<void>(resolve=>child.once('exit',()=>resolve()));await db.pool.end()}
})
