import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {Platform,type Actor} from '../src/platform'
import {Forum} from '../src/forum'

test('论坛列表：跨页筛选、作者与标签搜索、字面通配符、收藏和稳定排序',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const c=readConfig();assert.match(c.DB_NAME,/_test$/)
 const db=new Database(c),forum=new Forum(db,new Platform(db)),marker='feed_'+randomUUID().slice(0,8)
 const actor:Actor={id:randomUUID(),nickname:marker+'_author',role:'member',status:'active'},ids=Array.from({length:42},()=>randomUUID()),now=Date.now()
 try{
  await db.execute('INSERT INTO users(id,email,email_key,username,username_key,nickname,password_hash,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',[actor.id,actor.id+'@example.com',actor.id+'@example.com',marker,marker,actor.nickname,'unused-fixture',now,now])
  for(let i=0;i<ids.length;i++){
   const title=marker+' 第 '+i+' 篇'+(i===36?' 100%':''),data={id:ids[i],title,author:actor.nickname,content:['测试正文'],excerpt:'测试摘要',category:'作品讨论',tags:[i===35?marker+'_tag':'其他'],featured:[35,36,37].includes(i),pinned:i===37,createdAt:now-i}
   await db.execute('INSERT INTO forum_posts(id,user_id,title,category,data,status,created_at) VALUES (?,?,?,?,?,?,?)',[ids[i]!,actor.id,title,'作品讨论',JSON.stringify(data),i===40?'hidden':i===41?'deleted':'published',now-i])
  }
  for(const [index,status] of [[0,'published'],[1,'hidden'],[2,'deleted'],[3,'published'],[3,'published']] as const)await db.execute('INSERT INTO forum_replies(id,post_id,user_id,content,status,created_at) VALUES (?,?,?,?,?,?)',[randomUUID(),ids[index]!,actor.id,'一条回复',status,now])
  const options={q:marker,page:1,limit:6}
  const first=await forum.list(options),second=await forum.list({...options,page:2})
  assert.equal(first.total,40);assert.equal(first.items.length,6);assert.equal(first.items[0]!.id,ids[37]);assert.ok(second.items.every(p=>!first.items.some(a=>a.id===p.id)))
  assert.deepEqual((await forum.list(options)).items.map(p=>p.id),first.items.map(p=>p.id))
  const all=[];for(let page=1;page<=7;page++)all.push(...(await forum.list({...options,page})).items)
  assert.equal(all.length,40);assert.equal(new Set(all.map(p=>p.id)).size,40)
  const featured=await forum.list({...options,tab:'featured'})
  assert.equal(featured.total,3);assert.deepEqual(new Set(featured.items.map(p=>p.id)),new Set([ids[35],ids[36],ids[37]]))
  const unanswered=await forum.list({...options,tab:'unanswered',limit:100})
  assert.equal(unanswered.total,38);assert.ok(unanswered.items.some(p=>p.id===ids[1]));assert.ok(!unanswered.items.some(p=>p.id===ids[0]||p.id===ids[3]))
  assert.equal((await forum.list({...options,q:actor.nickname})).total,40)
  assert.equal((await forum.list({...options,q:marker+'_tag'})).items[0]!.id,ids[35])
  assert.equal((await forum.list({...options,q:marker+'%'})).total,0)
  assert.equal((await forum.list({...options,q:'100%'})).items[0]!.id,ids[36])
  assert.equal((await forum.list({...options,sort:'hot'})).items[1]!.id,ids[3])
  await assert.rejects(()=>forum.list({...options,saved:true}),/登录/)
  for(const i of [35,40])await db.execute("INSERT INTO forum_reactions(post_id,user_id,kind) VALUES (?,?,'bookmark')",[ids[i]!,actor.id])
  const saved=await forum.list({...options,saved:true,tab:'featured'},actor)
  assert.equal(saved.total,1);assert.equal(saved.items[0]!.id,ids[35])
  const viewedId=ids[0]!,viewer='a'.repeat(64)
  assert.equal((await forum.detail(viewedId)).views,0)
  await forum.replies(viewedId);assert.equal((await forum.detail(viewedId)).views,0,'读取回复和详情不自动刷浏览量')
  const simultaneous=await Promise.all(Array.from({length:8},()=>forum.recordView(viewedId,viewer)))
  assert.ok(simultaneous.every(result=>result.views===1),'同一访客的并发请求只计一次')
  assert.equal((await forum.recordView(viewedId,'b'.repeat(64))).views,2)
  await db.execute('UPDATE forum_view_receipts SET expires_at=? WHERE post_id=? AND viewer_key=?',[Date.now()-1,viewedId,viewer])
  assert.equal((await forum.recordView(viewedId,viewer)).views,3)
  await forum.edit(actor,viewedId,{title:marker+' 修改标题保留浏览数'})
  assert.equal((await forum.detail(viewedId)).views,3)
  assert.equal((await forum.list({...options,limit:100})).items.find(post=>post.id===viewedId)!.views,3)
  assert.equal((await forum.detail(viewedId)).replies,1)
  const replyId=(await forum.replies(viewedId))[0]!.id
  await db.execute("UPDATE forum_replies SET status='hidden' WHERE id=?",[replyId as string])
  assert.equal((await forum.detail(viewedId)).replies,0,'隐藏回复不计入公开回复数')
  await db.execute("UPDATE forum_posts SET status='hidden' WHERE id=?",[ids[35]!])
  await assert.rejects(()=>forum.recordView(ids[35]!,viewer),/不存在/)
  await assert.rejects(()=>forum.recordView(randomUUID(),viewer),/不存在/)
  assert.equal((await forum.list({...options,saved:true},actor)).total,0)
 }finally{await db.pool.end()}
})
