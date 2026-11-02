import { readConfig } from './config'
import { Database } from './database'
import { Platform } from './platform'
async function main(){const email=process.argv[2];if(!email)throw new Error('Supply a registered email address');const db=new Database(readConfig());try{await new Platform(db).bootstrap(email);console.log('First administrator configured. Sign in again.')}finally{await db.pool.end()}}
main().catch(e=>{console.error(e instanceof Error?e.message:'Bootstrap failed');process.exitCode=1})
