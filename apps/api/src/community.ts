import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {Database} from './database'
import {Platform,staff,reject,type Actor} from './platform'
import {decode} from './forum'
import type {PoolConnection} from 'mysql2/promise'
import {topicsSchema} from './topic-schema'
import {DEFAULT_SITE_BACKGROUND,normalizeSiteBackground} from './site-background'

const text=(max:number)=>z.string().trim().max(max)
const webUrl=z.string().url().max(500).refine(url=>/^https?:\/\//i.test(url),'链接必须使用 http 或 https。')
export const backgroundSchema=z.object({mode:z.enum(['image','solid']),assetId:z.uuid().nullable(),color:z.string().regex(/^#[0-9a-f]{6}$/i,'请输入有效的六位十六进制颜色。'),darkColor:z.string().regex(/^#[0-9a-f]{6}$/i,'请输入有效的六位十六进制颜色。')}).strict().transform(normalizeSiteBackground)
export const settingsSchema=z.object({title:text(60).min(1),description:text(300),announcement:text(500),joinInfo:text(1000),contact:text(200),background:backgroundSchema.optional(),links:z.array(z.object({name:text(40).min(1),url:webUrl}).strict()).max(20),version:z.number().int().min(0)}).strict()
export const draftSchema=z.object({title:text(80),content:z.string().max(10000),category:z.enum(['作品讨论','阅读手记','同好闲聊','社团活动']),spoiler:z.boolean(),tags:topicsSchema.default([]),workId:z.number().int().positive().nullable(),assetIds:z.array(z.uuid()).max(12)}).strict()
export const entrySchema=z.object({title:text(80).min(2),content:text(4000).min(1),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d,'请输入有效日期。'),kind:z.enum(['moment','activity']),assetIds:z.array(z.uuid()).max(12),status:z.enum(['published','hidden']).default('published')}).strict()
export const librarySchema=z.object({state:z.enum(['wish','reading','finished']),note:text(500),isPublic:z.boolean()}).strict()
export const defaultSettings={title:'南京工程学院澄之响视觉小说同好会',description:'让读完后的心情，遇见另一个懂你的人。',announcement:'',joinInfo:'入社方式与活动安排待管理员公布。',contact:'',links:[],background:{...DEFAULT_SITE_BACKGROUND},version:0}
export class Community {
 constructor(readonly db:Database,private platform:Platform){}
 private async write<T>(actor:Actor,admin:boolean,run:(tx:PoolConnection,current:Actor)=>Promise<T>){return this.db.transaction(async tx=>{await this.platform.lock(`account:${actor.id}`,tx);const current=await this.platform.actor(actor.id,tx);if(admin)staff(current);return run(tx,current)})}
 async assets(ids:string[],actor:Actor,tx:PoolConnection){for(const id of ids)if(!(await this.db.rows("SELECT id FROM assets WHERE id=? AND user_id=? AND status='active'",[id,actor.id],tx)).length)throw reject('配图不存在或不属于当前账号。',422)}
 async settings(){
  const row=(await this.db.rows<{data:Record<string,unknown>|string,version:number}>('SELECT data,version FROM site_settings WHERE id=1'))[0]
  const data=row?decode(row.data):{},background=normalizeSiteBackground(data.background)
  if(background.assetId&&!(await this.db.rows("SELECT id FROM assets WHERE id=? AND status='active'",[background.assetId])).length)background.assetId=null
  return {...defaultSettings,...data,background,version:row?.version||0}
 }
 async saveSettings(actor:Actor,input:z.infer<typeof settingsSchema>){return this.write(actor,true,async(tx,current)=>{
  await this.platform.lock('site-settings',tx)
  const row=(await this.db.rows<{data:Record<string,unknown>|string,version:number}>('SELECT data,version FROM site_settings WHERE id=1 FOR UPDATE',[],tx))[0]
  if((row?.version||0)!==input.version)throw reject('站点配置已被修改，请刷新后重试。')
  const previous=normalizeSiteBackground(row?decode(row.data).background:undefined),background=normalizeSiteBackground(input.background??previous)
  if(input.background&&background.mode==='image'&&background.assetId){
   if(!(await this.db.rows("SELECT id FROM assets WHERE id=? AND status='active' AND (user_id=? OR id=?) FOR UPDATE",[background.assetId,current.id,previous.assetId],tx)).length)throw reject('背景图片不可用，或不属于当前账号，请重新上传。',422)
  }
  const result={...input,background,version:input.version+1}
  await this.db.execute('INSERT INTO site_settings(id,data,version) VALUES (1,?,1) ON DUPLICATE KEY UPDATE data=VALUES(data),version=version+1',[JSON.stringify(result)],tx)
  await this.platform.audit(current,'更新站点配置',null,tx);return result
 })}
 async draft(actor:Actor){return (await this.db.rows<{data:unknown,updated_at:number}>('SELECT data,updated_at FROM forum_drafts WHERE user_id=?',[actor.id])).map(r=>({data:decode(r.data),updatedAt:Number(r.updated_at)}))[0]||null}
 async saveDraft(actor:Actor,input:z.infer<typeof draftSchema>){return this.write(actor,false,async tx=>{await this.assets(input.assetIds,actor,tx);await this.db.execute('INSERT INTO forum_drafts(user_id,data,updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),updated_at=VALUES(updated_at)',[actor.id,JSON.stringify(input),Date.now()],tx);return {message:'草稿已保存。'}})}
 async removeDraft(actor:Actor){return this.write(actor,false,async tx=>{await this.db.execute('DELETE FROM forum_drafts WHERE user_id=?',[actor.id],tx);return {message:'草稿已清除。'}})}
 async inbox(actor:Actor,page:number){const visible="n.user_id=? AND (n.post_id IS NULL OR (p.status='published' AND (n.reply_id IS NULL OR r.status='published')))";const joins='FROM notifications n LEFT JOIN forum_posts p ON p.id=n.post_id LEFT JOIN forum_replies r ON r.id=n.reply_id';const counts=(await this.db.rows<{total:number,unread:number}>(`SELECT COUNT(*) total,COALESCE(SUM(n.read_at IS NULL),0) unread ${joins} WHERE ${visible}`,[actor.id]))[0]!;const items=await this.db.rows(`SELECT n.id,n.kind,n.title,n.link,n.read_at AS readAt,n.created_at AS createdAt ${joins} WHERE ${visible} ORDER BY n.created_at DESC,n.id DESC LIMIT 20 OFFSET ${(page-1)*20}`,[actor.id]);return {items,total:Number(counts.total),unread:Number(counts.unread),page}}
 async read(actor:Actor,id?:string){return this.write(actor,false,async tx=>{await this.db.execute('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL'+(id?' AND id=?':''),[Date.now(),actor.id,...id?[id]:[]],tx);return {message:'已标记为已读。'}})}
 async profile(id:string){const row=(await this.db.rows<{id:string,nickname:string,signature:string,avatarAssetId:string|null,role:string,createdAt:number}>("SELECT id,nickname,signature,avatar_asset_id AS avatarAssetId,role,created_at AS createdAt FROM users WHERE id=? AND status='active'",[id]))[0];if(!row)throw reject('用户主页不存在或已停用。',404);const stats=(await this.db.rows('SELECT (SELECT COUNT(*) FROM forum_posts WHERE user_id=? AND status=\'published\') AS posts,(SELECT COUNT(*) FROM forum_replies r JOIN forum_posts p ON p.id=r.post_id WHERE r.user_id=? AND r.status=\'published\' AND p.status=\'published\') AS replies',[id,id]))[0];return {...row,avatarUrl:row.avatarAssetId?'/api/assets/'+row.avatarAssetId:null,stats,library:await this.library(id,true)}}
 async publicReplies(id:string,page:number){await this.profile(id);const base="FROM forum_replies r JOIN forum_posts p ON p.id=r.post_id WHERE r.user_id=? AND r.status='published' AND p.status='published'";const items=await this.db.rows(`SELECT r.id,r.post_id AS postId,p.title,r.content,r.created_at AS createdAt ${base} ORDER BY r.created_at DESC,r.id DESC LIMIT 12 OFFSET ${(page-1)*12}`,[id]);const total=(await this.db.rows<{n:number}>(`SELECT COUNT(*) n ${base}`,[id]))[0]!.n;return {items,total:Number(total),page}}
 async library(id:string,publicOnly=false){return this.db.rows(`SELECT l.work_id AS workId,l.state,l.note,l.is_public AS isPublic,l.updated_at AS updatedAt,w.data AS work FROM user_library l JOIN works w ON w.id=l.work_id WHERE l.user_id=? ${publicOnly?'AND l.is_public=1':''} ORDER BY l.updated_at DESC`,[id]).then(rows=>rows.map(r=>({...r,work:decode(r.work),isPublic:!!r.isPublic})))}
 async saveLibrary(actor:Actor,id:number,input:z.infer<typeof librarySchema>|null){return this.write(actor,false,async tx=>{if(!(await this.db.rows('SELECT id FROM works WHERE id=?',[id],tx)).length)throw reject('作品不存在。',404);if(input)await this.db.execute('INSERT INTO user_library(user_id,work_id,state,note,is_public,updated_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),note=VALUES(note),is_public=VALUES(is_public),updated_at=VALUES(updated_at)',[actor.id,id,input.state,input.note,input.isPublic,Date.now()],tx);else await this.db.execute('DELETE FROM user_library WHERE user_id=? AND work_id=?',[actor.id,id],tx);return {message:'书单已更新。'}})}
 async entries(page:number,admin?:Actor){if(admin)staff(admin);const where=admin?'':"WHERE e.status='published'";const rows=await this.db.rows<{id:string,data:unknown,status:string,author:string,userId:string}>(`SELECT e.id,e.data,e.status,e.user_id AS userId,u.nickname AS author FROM community_entries e JOIN users u ON u.id=e.user_id ${where} ORDER BY JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.date')) DESC,e.created_at DESC LIMIT 12 OFFSET ${(page-1)*12}`);const total=(await this.db.rows<{n:number}>(`SELECT COUNT(*) n FROM community_entries e ${where}`))[0]!.n;return {items:rows.map(r=>({...r,...decode(r.data) as object})),total:Number(total),page}}
 async saveEntry(actor:Actor,input:z.infer<typeof entrySchema>,id?:string){return this.write(actor,true,async(tx,current)=>{
  const entryId=id||randomUUID();let previous:string[]=[]
  if(id){await this.platform.lock('entry:'+id,tx);const entry=(await this.db.rows<{data:{assetIds:string[]}|string}>('SELECT data FROM community_entries WHERE id=?',[id],tx))[0];if(!entry)throw reject('动态不存在。',404);previous=decode(entry.data).assetIds||[]}
  await this.assets(input.assetIds.filter(asset=>!previous.includes(asset)),actor,tx)
  if(id)await this.db.execute('UPDATE community_entries SET data=?,status=? WHERE id=?',[JSON.stringify(input),input.status,id],tx)
  else await this.db.execute('INSERT INTO community_entries(id,user_id,data,status,created_at) VALUES (?,?,?,?,?)',[entryId,actor.id,JSON.stringify(input),input.status,Date.now()],tx)
  await this.platform.audit(current,'保存社团动态与相册 '+entryId,null,tx);return {id:entryId}
 })}
}
