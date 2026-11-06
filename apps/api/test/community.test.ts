import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {schema} from '../src/schema'
import {Platform,type Actor} from '../src/platform'
import {Forum} from '../src/forum'
import {Community,defaultSettings,settingsSchema,entrySchema} from '../src/community'
import {postExcerpt} from '../src/post-content'

test('剧透不泄露到列表摘要，嵌套和未闭合折叠也保守隐藏',()=>{
 assert.equal(postExcerpt('安全介绍\n:::spoiler\n关键结局\n:::spoiler\n秘密\n:::\n隐藏尾声\n:::\n安全尾声'),'安全介绍 [剧透内容] 安全尾声')
 assert.doesNotMatch(postExcerpt('开头 ||秘密结局|| 结尾'),/秘密结局/)
 assert.doesNotMatch(postExcerpt('开头\n:::spoiler\n秘密结局'),/秘密结局/)
 assert.doesNotMatch(postExcerpt('全部秘密',true),/全部秘密/)
 assert.equal(settingsSchema.safeParse({...defaultSettings,links:[{name:'恶意',url:'javascript:alert(1)'}]}).success,false)
 assert.equal(entrySchema.safeParse({title:'活动',content:'说明',date:'2026-02-31',kind:'activity',assetIds:[]}).success,false)
})

test('社区完整流程：草稿隔离、公开资料、书单隐私、回复通知、配置版本及动态权限',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const config=readConfig();assert.match(config.DB_NAME,/_test$/);const db=new Database(config),platform=new Platform(db),forum=new Forum(db,platform),community=new Community(db,platform)
 const actors:Actor[]=[]
 try{
  for(const sql of schema)await db.execute(sql)
  for(const role of ['admin','member','member']){const id=randomUUID();await db.execute('INSERT INTO users(id,email,email_key,nickname,signature,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[id,id+'@example.com',id+'@example.com','同好'+id.slice(0,4),'公开签名','not-used',role,Date.now(),Date.now()]);actors.push({id,nickname:'同好',role,status:'active'})}
  const [admin,member,other]=actors as [Actor,Actor,Actor]
  const workId=98531;await db.execute('INSERT IGNORE INTO works(id,data) VALUES (?,?)',[workId,JSON.stringify({rank:workId,title:'测试作品'})])
  const draft={title:'测试草稿',content:'这是一篇暂未公开的草稿。',category:'作品讨论' as const,spoiler:false,workId:null,assetIds:[]}
  await community.saveDraft(member,draft);assert.equal((await community.draft(other)),null);assert.deepEqual((await community.draft(member))!.data,draft)
  const assetId=randomUUID();await db.execute('INSERT INTO assets(id,user_id,width,height,bytes,created_at) VALUES (?,?,?,?,?,?)',[assetId,other.id,10,10,10,Date.now()])
  await assert.rejects(()=>community.saveDraft(member,{...draft,assetIds:[assetId]}),/不属于/)
  await assert.rejects(()=>forum.create(member,{title:'引用其他人的配图',content:'正文 ![图片](/api/assets/'+assetId+')',category:'作品讨论',spoiler:false,format:'markdown'}),/不属于/)
  const post=await forum.create(member,{title:'编辑器完整流程测试',content:'## 开头\n安全介绍\n:::spoiler\n关键结局\n:::',category:'作品讨论',spoiler:false,format:'markdown',workId})
  assert.equal(await community.draft(member),null);const detail=await forum.detail(post.id);assert.equal(detail.format,'markdown');assert.doesNotMatch(detail.excerpt,/关键结局/)
  assert.ok((await forum.list({page:1,limit:12,workId})).items.some(item=>item.id===post.id))
  assert.ok((await forum.list({page:1,limit:12,authorId:member.id})).items.every(item=>item.userId===member.id))
  await community.saveLibrary(member,workId,{state:'reading',note:'私人的感想',isPublic:false});assert.equal((await community.profile(member.id)).library.length,0)
  await community.saveLibrary(member,workId,{state:'finished',note:'公开推荐',isPublic:true});assert.equal((await community.profile(member.id)).library.length,1)
  const profile=await community.profile(member.id);assert.equal('email' in profile,false);assert.equal('password_hash' in profile,false);assert.equal('username' in profile,false)
  const first=await forum.reply(other,post.id,'第一条回复');const reply=await forum.reply(member,post.id,'回复这位同好',first.id)
  const replyRows=await forum.replies(post.id);assert.equal((replyRows.find(r=>(r as {id:string}).id===reply.id) as unknown as {parentId:string}).parentId,first.id)
  assert.equal((await community.inbox(member,1)).unread,1);assert.equal((await community.inbox(other,1)).unread,1)
  const message=(await community.inbox(other,1)).items[0] as {id:string};await community.read(member,message.id);assert.equal((await community.inbox(other,1)).unread,1,'不能标记他人的通知')
  await community.read(other,message.id);assert.equal((await community.inbox(other,1)).unread,0)
  const another=await forum.create(member,{title:'另一篇测试帖子',content:'用于检测跨帖回复绑定的内容。',category:'同好闲聊',spoiler:false})
  await assert.rejects(()=>forum.reply(other,another.id,'跨帖回复',first.id),/不存在/)
  await forum.moderateReply(admin,reply.id,'hidden');assert.equal((await community.inbox(other,1)).total,0,'隐藏的回复不出现在通知中')
  const settings=await community.settings();await assert.rejects(()=>community.saveSettings(member,{...defaultSettings,version:settings.version}),/管理员/)
  await community.saveSettings(admin,{...defaultSettings,announcement:'测试公告',version:settings.version});await assert.rejects(()=>community.saveSettings(admin,{...defaultSettings,version:settings.version}),/刷新/)
  const entry={title:'线下共读记录',content:'一起聊聊喜欢的故事。',date:'2026-11-04',kind:'activity' as const,assetIds:[],status:'hidden' as const}
  await assert.rejects(()=>community.saveEntry(member,entry),/管理员/)
  const saved=await community.saveEntry(admin,entry);assert.ok(!(await community.entries(1)).items.some(item=>item.id===saved.id));await community.saveEntry(admin,{...entry,status:'published'},saved.id);assert.ok((await community.entries(1)).items.some(item=>item.id===saved.id))
  await db.execute("UPDATE users SET status='disabled' WHERE id=?",[member.id]);await assert.rejects(()=>community.saveDraft(member,draft),/不可用/);await assert.rejects(()=>community.profile(member.id),/停用/)
 }finally{await db.pool.end()}
})
