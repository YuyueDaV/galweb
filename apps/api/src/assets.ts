import sharp, {type OutputInfo} from 'sharp'
import {randomUUID} from 'node:crypto'
import {mkdir,writeFile,unlink} from 'node:fs/promises'
import path from 'node:path'
import {Database} from './database'
import {reject,staff,type Actor,Platform} from './platform'
export class Assets {
 readonly directory=path.resolve(process.env.UPLOAD_DIR||'.data/uploads')
 constructor(private db:Database,private platform:Platform){}
 async list(actor:Actor){staff(actor);return this.db.rows('SELECT id,user_id AS userId,width,height,bytes,status,created_at AS createdAt FROM assets ORDER BY created_at DESC LIMIT 200')}
 async create(actor:Actor,buffer:Buffer){
  if(buffer.length>5*1024*1024)throw reject('图片不能超过 5 MB。',413)
  let output:Buffer,info:OutputInfo
  try{const image=sharp(buffer,{limitInputPixels:40000000,animated:false});const metadata=await image.metadata();if(!['jpeg','png','webp'].includes(metadata.format||''))throw new Error('format');const result=await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});output=result.data;info=result.info}catch{throw reject('请上传有效的 JPG、PNG 或 WebP 图片。',422)}
  const id=randomUUID(),filename=path.join(this.directory,id+'.webp');await mkdir(this.directory,{recursive:true});await writeFile(filename,output,{flag:'wx',mode:0o600})
  try{await this.db.transaction(async tx=>{await this.platform.actor(actor.id,tx);await this.db.execute('INSERT INTO assets(id,user_id,width,height,bytes,created_at) VALUES (?,?,?,?,?,?)',[id,actor.id,info.width,info.height,output.length,Date.now()],tx)})}catch(error){await unlink(filename).catch(()=>{});throw error}
  return {id,url:'/api/assets/'+id,width:info.width,height:info.height}
 }
 async file(id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw reject('图片不存在。',404);if(!(await this.db.rows("SELECT id FROM assets WHERE id=? AND status='active'",[id])).length)throw reject('图片不存在。',404);return path.join(this.directory,id+'.webp')}
 async cleanupDeletedAccounts(){
  const rows=await this.db.rows<{id:string}>("SELECT a.id FROM assets a JOIN users u ON u.id=a.user_id WHERE u.status='deleted' AND a.status='hidden' LIMIT 200")
  for(const row of rows){
   if(!/^[a-f0-9-]{36}$/.test(row.id))continue
   try{await unlink(path.join(this.directory,row.id+'.webp'))}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   await this.db.execute("DELETE FROM assets WHERE id=? AND status='hidden'",[row.id])
  }
 }
 async hide(actor:Actor,id:string){staff(actor);return this.db.transaction(async tx=>{await this.platform.actor(actor.id,tx);await this.db.execute("UPDATE assets SET status='hidden' WHERE id=?",[id],tx);await this.platform.audit(actor,'隐藏图片 '+id,null,tx);return {message:'图片已隐藏。'}})}
}
