import {readConfig} from './config'
import {Database} from './database'
async function main(){const db=new Database(readConfig());try{await db.rows('SELECT 1');console.log('Database connection OK.')}catch(e){const error=e as {code?:string,errno?:number,sqlState?:string};console.error(JSON.stringify({code:error.code,errno:error.errno,sqlState:error.sqlState}));process.exitCode=1}finally{await db.pool.end()}}
main().catch(()=>{console.error('Configuration validation failed.');process.exitCode=1})
