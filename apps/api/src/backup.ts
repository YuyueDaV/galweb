import {spawn} from 'node:child_process'
import {mkdir,writeFile,cp,rm} from 'node:fs/promises'
import {createWriteStream} from 'node:fs'
import path from 'node:path'
import {pipeline} from 'node:stream/promises'
import {randomUUID} from 'node:crypto'
import {readConfig} from './config'
async function main(){
 const c=readConfig(),base=path.resolve(process.env.BACKUP_DIR||'.data/backups'),dir=path.join(base,new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8));await mkdir(dir,{recursive:true})
 const credentials=path.join(dir,'.mysql-client.cnf'),escape=(s:string)=>'"'+s.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r')+'"'
 try{
  await writeFile(credentials,`[client]\nhost=${escape(c.DB_HOST)}\nport=${c.DB_PORT}\nuser=${escape(c.DB_USER)}\npassword=${escape(c.DB_PASSWORD)}\n`,{mode:0o600})
  const child=spawn(process.env.MYSQLDUMP_PATH||'mysqldump',[`--defaults-extra-file=${credentials}`,'--single-transaction','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--hex-blob',c.DB_NAME],{stdio:['ignore','pipe','pipe']})
  let failed=false;child.stderr?.on('data',()=>{failed=true})
  const finished=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('mysqldump failed')))})
  await Promise.all([pipeline(child.stdout!,createWriteStream(path.join(dir,'database.sql.partial'),{mode:0o600})),finished])
  const {rename}=await import('node:fs/promises');await rename(path.join(dir,'database.sql.partial'),path.join(dir,'database.sql'))
  try{await cp(path.resolve(process.env.UPLOAD_DIR||'.data/uploads'),path.join(dir,'uploads'),{recursive:true})}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
  await writeFile(path.join(dir,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),database:c.DB_NAME,warning:failed?'mysqldump produced diagnostics; inspect server logs.':null,complete:true},null,2));console.log('Backup complete:',dir)
 }finally{await rm(credentials,{force:true})}
}
main().catch(()=>{console.error('Backup failed. Check mysqldump path, connectivity and backup permissions. Incomplete folders have no complete manifest.');process.exitCode=1})
