import sharp, {type OutputInfo} from 'sharp'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile,unlink,readFile,access,rename,readdir} from 'node:fs/promises'
import path from 'node:path'
import {Database} from './database'
import {reject,staff,type Actor,Platform} from './platform'
export class Assets {
 readonly directory=path.resolve(process.env.UPLOAD_DIR||'.data/uploads')
 constructor(private db:Database,private platform:Platform){}
 capabilities(actor:Actor){staff(actor);return {version:2,preview:true,moderation:true,deletion:true}}
 async list(actor:Actor){staff(actor);return this.db.rows('SELECT a.id,a.user_id AS userId,u.nickname AS uploader,u.status AS ownerStatus,a.width,a.height,a.bytes,a.status,a.created_at AS createdAt FROM assets a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id DESC LIMIT 200')}
 async create(actor:Actor,buffer:Buffer){
  if(buffer.length>5*1024*1024)throw reject('图片不能超过 5 MB。',413)
  let output:Buffer,info:OutputInfo
  try{const image=sharp(buffer,{limitInputPixels:40000000,animated:false});const metadata=await image.metadata();if(!['jpeg','png','webp'].includes(metadata.format||''))throw new Error('format');const result=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});output=result.data;info=result.info}catch{throw reject('请上传有效的 JPG、PNG 或 WebP 图片。',422)}
  const id=randomUUID(),filename=path.join(this.directory,id+'.webp');await mkdir(this.directory,{recursive:true});await writeFile(filename,output,{flag:'wx',mode:0o600})
  let storedId:string=id
  try{
   storedId=await this.db.transaction(async tx=>{
    // The uploader row serializes uploads from the same account, including retries.
    await this.platform.actor(actor.id,tx)
    const matches=await this.db.rows<{id:string}>("SELECT id FROM assets WHERE user_id=? AND status='active' AND width=? AND height=? AND bytes=? ORDER BY created_at DESC",[actor.id,info.width,info.height,output.length],tx)
    for(const candidate of matches){
     if(!/^[a-f0-9-]{36}$/.test(candidate.id))continue
     try{if((await readFile(path.join(this.directory,candidate.id+'.webp'))).equals(output))return candidate.id}
     catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
    }
    await this.db.execute('INSERT INTO assets(id,user_id,width,height,bytes,created_at) VALUES (?,?,?,?,?,?)',[id,actor.id,info.width,info.height,output.length,Date.now()],tx)
    return id
   })
   if(storedId!==id)await unlink(filename)
  }catch(error){await unlink(filename).catch(()=>{});throw error}
  return {id:storedId,url:'/api/assets/'+storedId,width:info.width,height:info.height}
 }
 async file(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw reject('图片不存在。',404);if(!(await this.db.rows("SELECT id FROM assets WHERE id=? AND status='active'",[id])).length)throw reject('图片不存在。',404);return path.join(this.directory,id+'.webp')}
 async adminFile(actor:Actor,id:string){
  staff(await this.platform.actor(actor.id))
  if(!/^[a-f0-9-]{36}$/.test(id))throw reject('图片不存在。',404)
  if(!(await this.db.rows("SELECT a.id FROM assets a JOIN users u ON u.id=a.user_id WHERE a.id=? AND u.status<>'deleted'",[id])).length)throw reject('图片不存在。',404)
  return path.join(this.directory,id+'.webp')
 }
 async cleanupDeletedAccounts(){
  const rows=await this.db.rows<{id:string}>("SELECT a.id FROM assets a JOIN users u ON u.id=a.user_id WHERE u.status='deleted' AND a.status='hidden' LIMIT 200")
  for(const row of rows){
   if(!/^[a-f0-9-]{36}$/.test(row.id))continue
   try{await unlink(path.join(this.directory,row.id+'.webp'))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   await this.db.execute("DELETE FROM assets WHERE id=? AND status='hidden'",[row.id])
  }
 }
 async moderate(actor:Actor,id:string,status:'active'|'hidden'){
  staff(actor)
  if(!/^[a-f0-9-]{36}$/.test(id))throw reject('图片不存在。',404)
  return this.db.transaction(async tx=>{
   await this.platform.lock('account-roles',tx)
   const current=await this.platform.actor(actor.id,tx);staff(current)
   const target=(await this.db.rows<{id:string,status:string,ownerStatus:string}>('SELECT a.id,a.status,u.status AS ownerStatus FROM assets a JOIN users u ON u.id=a.user_id WHERE a.id=? FOR UPDATE',[id],tx))[0]
   if(!target)throw reject('图片不存在。',404)
   if(status==='active'){
    if(target.ownerStatus==='deleted')throw reject('已注销账号的图片不能恢复。')
    try{await access(path.join(this.directory,id+'.webp'))}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw reject('图片文件已丢失，无法恢复，请重新上传。');throw error}
   }
   if(target.status!==status){await this.db.execute('UPDATE assets SET status=? WHERE id=?',[status,id],tx);await this.platform.audit(current,(status==='active'?'恢复图片 ':'隐藏图片 ')+id,null,tx)}
   return {message:status==='active'?'图片已恢复。':'图片已隐藏。'}
  })
 }
 async hide(actor:Actor,id:string){return this.moderate(actor,id,'hidden')}
 async remove(actor:Actor,id:string){
  staff(actor)
  if(!/^[a-f0-9-]{36}$/.test(id))throw reject('图片不存在。',404)
  const filename=path.join(this.directory,id+'.webp'),trash=path.join(this.directory,'.trash',id+'.webp')
  let moved=false
  try{
   await this.db.transaction(async tx=>{
    await this.platform.lock('account-roles',tx)
    const current=await this.platform.actor(actor.id,tx);staff(current)
    const candidate=(await this.db.rows<{user_id:string}>('SELECT user_id FROM assets WHERE id=?',[id],tx))[0]
    if(!candidate)return
    // Match profile/upload lock order: uploader first, then asset.
    await this.db.rows('SELECT id FROM users WHERE id=? FOR UPDATE',[candidate.user_id],tx)
    if(!(await this.db.rows('SELECT id FROM assets WHERE id=? FOR UPDATE',[id],tx)).length)return
    await this.db.execute('UPDATE users SET avatar_asset_id=NULL WHERE id=? AND avatar_asset_id=?',[candidate.user_id,id],tx)
    await this.db.execute('DELETE FROM assets WHERE id=?',[id],tx)
    await this.platform.audit(current,'永久删除图片 '+id,null,tx)
    await mkdir(path.dirname(trash),{recursive:true,mode:0o700})
    // Stage the file so a transaction failure can restore it. Missing files may
    // still have stale upload records and must remain removable.
    try{await rename(filename,trash);moved=true}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   })
  }catch(error){if(moved)await this.settlePendingDelete(id).catch(()=>{});throw error}
  if(moved){try{await unlink(trash)}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT'){console.error('Deleted asset file cleanup will be retried.');return {message:'图片已删除，文件清理将在后台重试。'}}}}
  return {message:'图片已永久删除。'}
 }
 async cleanupPendingDeletes(){
  const directory=path.join(this.directory,'.trash')
  let names:string[]
  try{names=await readdir(directory)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error}
  for(const name of names.filter(name=>/^[a-f0-9-]{36}\.webp$/.test(name)).slice(0,200)){
   await this.settlePendingDelete(name.slice(0,-5))
  }
 }
 private async settlePendingDelete(id:string){
   await this.db.transaction(async tx=>{
    await this.platform.lock('account-roles',tx)
    const source=path.join(this.directory,'.trash',id+'.webp'),target=path.join(this.directory,id+'.webp')
    try{
     if((await this.db.rows('SELECT id FROM assets WHERE id=?',[id],tx)).length){
      try{await access(target)}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT'){await rename(source,target);return}throw error}
     }
     await unlink(source)
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   })
 }
}
