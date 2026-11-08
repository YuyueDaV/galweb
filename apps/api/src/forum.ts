import { randomUUID } from 'node:crypto'
import { Database } from './database'
import { Platform,staff,reject,type Actor } from './platform'
import type { PoolConnection } from 'mysql2/promise'
import {notifyUser} from './notifications'
import {postExcerpt} from './post-content'
import {recentTopics,topicKey,uniqueTopics} from './post-topics'
export const decode=<T>(data:T|string):T=>typeof data==='string'?JSON.parse(data):data
type PostData={id:string,title:string,content:string[],excerpt:string,category:string,author:string,avatar:string,avatarColor:string,createdAt:number,tags:string[],pinned?:boolean,featured?:boolean,spoiler?:boolean,image?:number,uploadedImage?:string,format?:'plain'|'markdown',body?:string,assetIds?:string[],workId?:number|null}
type PostRow={id:string,user_id:string|null,display_name?:string|null,avatar_asset_id?:string|null,data:PostData|string,status:string,likes:number,replies:number,views?:number}
export class Forum {
 constructor(readonly db:Database,private platform:Platform){}
 async list(options:{q?:string,tag?:string,category?:string,page:number,limit:number,saved?:boolean,sort?:string,tab?:'latest'|'featured'|'unanswered',authorId?:string,workId?:number},actor?:Actor){
  const filters=["p.status='published'"],values:(string|number)[]=[]
  if(options.q?.trim()){
   const pattern=`%${options.q.trim().replace(/[!%_]/g,'!$&')}%`
   filters.push("(p.title LIKE ? ESCAPE '!' OR JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.excerpt')) LIKE ? ESCAPE '!' OR COALESCE(u.nickname,JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.author'))) LIKE ? ESCAPE '!' OR JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.tags')) LIKE ? ESCAPE '!')")
   values.push(pattern,pattern,pattern,pattern)
  }
  if(options.tag){filters.push("JSON_CONTAINS(LOWER(JSON_EXTRACT(p.data,'$.tags')),JSON_QUOTE(?))");values.push(topicKey(options.tag))}
  if(options.category){filters.push('p.category=?');values.push(options.category)}
  if(options.authorId){filters.push('p.user_id=?');values.push(options.authorId)}
  if(options.workId){filters.push("(JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.workId'))=? OR JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.image'))=?)");values.push(String(options.workId),String(options.workId))}
  if(options.tab==='featured')filters.push("JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.featured'))='true'")
  if(options.tab==='unanswered')filters.push("NOT EXISTS(SELECT 1 FROM forum_replies r WHERE r.post_id=p.id AND r.status='published')")
  if(options.saved){if(!actor)throw reject('请先登录。',401);filters.push("EXISTS(SELECT 1 FROM forum_reactions r WHERE r.post_id=p.id AND r.user_id=? AND r.kind='bookmark')");values.push(actor.id)}
  const where=filters.join(' AND '),count=(await this.db.rows<{n:number}>(`SELECT COUNT(*) n FROM forum_posts p LEFT JOIN users u ON u.id=p.user_id WHERE ${where}`,values))[0]!.n
  const rows=await this.db.rows<PostRow>(`SELECT p.*,m.views,u.nickname AS display_name,u.avatar_asset_id, (SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id AND r.kind='like') likes, (SELECT COUNT(*) FROM forum_replies r WHERE r.post_id=p.id AND r.status='published') replies FROM forum_posts p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN forum_post_metrics m ON m.post_id=p.id WHERE ${where} ORDER BY COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.pinned'))='true',0) DESC,${options.sort==='hot'?'replies DESC,':''}p.created_at DESC,p.id DESC LIMIT ${options.limit} OFFSET ${(options.page-1)*options.limit}`,values)
  return {items:rows.map(r=>this.dto(r)),total:count,page:options.page,limit:options.limit}
 }
 async topics(limit=20){
  const rows=await this.db.rows<{tags:string[]|string|null,created_at:number}>("SELECT JSON_EXTRACT(data,'$.tags') AS tags,created_at FROM forum_posts WHERE status='published' ORDER BY created_at DESC,id DESC LIMIT 100")
  return recentTopics(rows.map(row=>{const tags=decode(row.tags||[]);return {tags:Array.isArray(tags)?tags.filter((tag):tag is string=>typeof tag==='string'):[],createdAt:Number(row.created_at)}}),limit)
 }
 dto(row:PostRow){return {...decode(row.data),status:row.status,...(row.display_name?{author:row.display_name,avatar:row.display_name.slice(0,1)}:{}),id:row.id,userId:row.user_id,avatarUrl:row.avatar_asset_id?'/api/assets/'+row.avatar_asset_id:null,likes:Number(row.likes)||0,replies:Number(row.replies)||0,views:Number(row.views)||0,time:row.user_id===null?'历史档案':new Date(Number(decode(row.data).createdAt)).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'})}}
 async get(id:string,actor?:Actor,tx?:PoolConnection){const row=(await this.db.rows<PostRow>("SELECT p.*,m.views,u.nickname AS display_name,u.avatar_asset_id,(SELECT COUNT(*) FROM forum_reactions r WHERE r.post_id=p.id AND r.kind='like') likes,(SELECT COUNT(*) FROM forum_replies r WHERE r.post_id=p.id AND r.status='published') replies FROM forum_posts p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN forum_post_metrics m ON m.post_id=p.id WHERE p.id=?",[id],tx))[0];if(!row||(row.status!=='published'&&(!actor||actor.role==='member')))throw reject('帖子不存在。',404);return row}
 async detail(id:string,actor?:Actor){return this.dto(await this.get(id,actor))}
 async recordView(id:string,viewerKey:string){return this.db.transaction(async tx=>{
  await this.get(id,undefined,tx)
  await this.db.execute('INSERT INTO forum_post_metrics(post_id) VALUES (?) ON DUPLICATE KEY UPDATE views=views',[id],tx)
  const metric=(await this.db.rows<{views:number}>('SELECT views FROM forum_post_metrics WHERE post_id=? FOR UPDATE',[id],tx))[0]!
  const receipt=(await this.db.rows<{expires_at:number}>('SELECT expires_at FROM forum_view_receipts WHERE post_id=? AND viewer_key=? FOR UPDATE',[id,viewerKey],tx))[0]
  const now=Date.now()
  if(receipt&&Number(receipt.expires_at)>now)return {views:Number(metric.views)}
  await this.db.execute('INSERT INTO forum_view_receipts(post_id,viewer_key,expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE expires_at=?',[id,viewerKey,now+1800000,now+1800000],tx)
  await this.db.execute('UPDATE forum_post_metrics SET views=views+1 WHERE post_id=?',[id],tx)
  return {views:Number(metric.views)+1}
 })}
 async validateContent(actor:Actor,content:string,ids:string[],workId:number|null|undefined,tx:PoolConnection,existing:string[]=[]){
  const referenced=[...content.matchAll(/\/api\/assets\/([a-f0-9-]{36})/gi)].map(m=>m[1]!)
  const all=[...new Set([...ids,...referenced])];if(all.length>12)throw reject('每篇帖子最多使用 12 张图片。',422)
  for(const id of all)if(!(await this.db.rows("SELECT id FROM assets WHERE id=? AND status='active' AND (user_id=? OR ?=1)",[id,actor.id,existing.includes(id)?1:0],tx)).length)throw reject('图片不可用或不属于当前账号。',422)
  if(workId&&!(await this.db.rows('SELECT id FROM works WHERE id=?',[workId],tx)).length)throw reject('关联作品不存在。',422)
  return all
 }
 async create(actor:Actor,input:{title:string,content:string,category:string,spoiler:boolean,tags?:string[],image?:number,assetId?:string,assetIds?:string[],format?:'plain'|'markdown',workId?:number|null}){
  return this.db.transaction(async tx=>{
  await this.platform.actor(actor.id,tx)
  const assetIds=await this.validateContent(actor,input.content,[...input.assetIds||[],...input.assetId?[input.assetId]:[]],input.workId,tx)
  const id=randomUUID(),now=Date.now(),data:PostData={id,title:input.title,content:input.content.split(/\n\s*\n/),excerpt:postExcerpt(input.content,input.spoiler),category:input.category,author:actor.nickname,avatar:actor.nickname.slice(0,1),avatarColor:'orange',createdAt:now,tags:uniqueTopics(input.tags||[]),spoiler:input.spoiler,image:input.image,uploadedImage:input.assetId?'/api/assets/'+input.assetId:undefined,format:input.format||'plain',body:input.content,assetIds,workId:input.workId}
  await this.db.execute('INSERT INTO forum_posts(id,user_id,title,category,data,created_at) VALUES (?,?,?,?,?,?)',[id,actor.id,input.title,input.category,JSON.stringify(data),now],tx);await this.db.execute('DELETE FROM forum_drafts WHERE user_id=?',[actor.id],tx);return {id}
  })
 }
 async reply(actor:Actor,id:string,content:string,parentId?:string){return this.db.transaction(async tx=>{
  const current=await this.platform.actor(actor.id,tx),post=await this.get(id,undefined,tx)
  let parent:{user_id:string}|undefined
  if(parentId){parent=(await this.db.rows<{user_id:string}>("SELECT user_id FROM forum_replies WHERE id=? AND post_id=? AND status='published'",[parentId,id],tx))[0];if(!parent)throw reject('所回复的内容不存在。',422)}
  const replyId=randomUUID();await this.db.execute('INSERT INTO forum_replies(id,post_id,user_id,content,created_at) VALUES (?,?,?,?,?)',[replyId,id,actor.id,content,Date.now()],tx)
  if(parentId)await this.db.execute('INSERT INTO forum_reply_context(reply_id,parent_id) VALUES (?,?)',[replyId,parentId],tx)
  for(const recipient of new Set([post.user_id,parent?.user_id]))if(recipient&&recipient!==actor.id)await notifyUser(this.db,recipient,'reply',current.nickname+' 回复了《'+decode(post.data).title+'》','/post/'+id+'#reply-'+replyId,tx,id,replyId)
  return {id:replyId}
 })}
 async replies(id:string,actor?:Actor){await this.get(id,actor);const rows=await this.db.rows<{avatarAssetId:string|null}>("SELECT r.id,r.post_id AS postId,r.user_id AS userId,u.nickname AS author,u.avatar_asset_id AS avatarAssetId,r.content,r.created_at AS createdAt,pr.id AS parentId,pu.nickname AS parentAuthor FROM forum_replies r JOIN users u ON r.user_id=u.id LEFT JOIN forum_reply_context ctx ON ctx.reply_id=r.id LEFT JOIN forum_replies pr ON pr.id=ctx.parent_id AND pr.status='published' LEFT JOIN users pu ON pu.id=pr.user_id WHERE r.post_id=? AND r.status='published' ORDER BY r.created_at,r.id LIMIT 500",[id]);return rows.map(r=>({...r,avatarUrl:r.avatarAssetId?'/api/assets/'+r.avatarAssetId:null}))}
 async reaction(actor:Actor,id:string,kind:'like'|'bookmark',active:boolean){return this.db.transaction(async tx=>{await this.platform.actor(actor.id,tx);await this.get(id,undefined,tx);if(active)await this.db.execute('INSERT IGNORE INTO forum_reactions(post_id,user_id,kind) VALUES (?,?,?)',[id,actor.id,kind],tx);else await this.db.execute('DELETE FROM forum_reactions WHERE post_id=? AND user_id=? AND kind=?',[id,actor.id,kind],tx);return {active}})}
 async mine(actor:Actor){const rows=await this.db.rows<{post_id:string,kind:string}>('SELECT post_id,kind FROM forum_reactions WHERE user_id=?',[actor.id]);return {likes:rows.filter(r=>r.kind==='like').map(r=>r.post_id),bookmarks:rows.filter(r=>r.kind==='bookmark').map(r=>r.post_id)}}
 async edit(actor:Actor,id:string,patch:{title?:string,content?:string,tags?:string[],status?:string,pinned?:boolean,featured?:boolean,format?:'plain'|'markdown',workId?:number|null,assetIds?:string[],spoiler?:boolean}){return this.db.transaction(async tx=>{
  const current=await this.platform.actor(actor.id,tx);await this.platform.lock('post:'+id,tx);const row=await this.get(id,current,tx);if(current.id!==row.user_id)staff(current);if(patch.pinned!==undefined||patch.featured!==undefined||patch.status==='hidden'||patch.status==='published')staff(current)
  if(row.status==='deleted')throw reject('帖子已删除，不能再次修改。')
  const data=decode(row.data);const existing=[...data.assetIds||[],...data.uploadedImage?[data.uploadedImage.split('/').pop()!]:[]]
  if(patch.content!==undefined||patch.assetIds!==undefined||patch.workId!==undefined){data.assetIds=await this.validateContent(current,patch.content??data.body??data.content.join('\n\n'),patch.assetIds??data.assetIds??[],patch.workId===undefined?data.workId:patch.workId,tx,existing)}
  if(patch.tags!==undefined)data.tags=uniqueTopics(patch.tags)
  if(patch.title)data.title=patch.title;if(patch.content){data.body=patch.content;data.content=patch.content.split(/\n\s*\n/)}
  if(patch.format)data.format=patch.format;if(patch.workId!==undefined)data.workId=patch.workId;if(patch.spoiler!==undefined)data.spoiler=patch.spoiler
  data.excerpt=postExcerpt(data.body??data.content.join('\n\n'),data.spoiler)
  if(patch.pinned!==undefined)data.pinned=patch.pinned;if(patch.featured!==undefined)data.featured=patch.featured
  await this.db.execute('UPDATE forum_posts SET title=?,data=?,status=? WHERE id=?',[data.title,JSON.stringify(data),patch.status||row.status,id],tx);await this.platform.audit(current,(patch.status==='deleted'?'删除帖子 ':'修改帖子 ')+id,null,tx);return {message:patch.status==='deleted'?'帖子已删除。':'帖子已更新。'}
 })}
 async remove(actor:Actor,id:string){return this.edit(actor,id,{status:'deleted'})}
 async moderateReply(actor:Actor,id:string,status:string){staff(actor);return this.db.transaction(async tx=>{await this.platform.actor(actor.id,tx);await this.db.execute('UPDATE forum_replies SET status=? WHERE id=?',[status,id],tx);await this.platform.audit(actor,`审核回复 ${id}：${status}`,null,tx);return {message:'回复已更新。'}})}
 async adminPosts(actor:Actor){staff(actor);const rows=await this.db.rows<PostRow>('SELECT p.*,m.views,u.nickname AS display_name FROM forum_posts p LEFT JOIN users u ON u.id=p.user_id LEFT JOIN forum_post_metrics m ON m.post_id=p.id ORDER BY p.created_at DESC LIMIT 200');return rows.map(r=>({...this.dto(r),status:r.status}))}
 async adminReplies(actor:Actor){staff(actor);return this.db.rows('SELECT r.id,r.content,r.status,p.title,u.nickname AS author FROM forum_replies r JOIN forum_posts p ON p.id=r.post_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200')}
}
