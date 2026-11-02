import { readConfig } from './config'
import { Database } from './database'
import { schema } from './schema'
import { seed } from './seed'
import {migrateUsernames} from './user-migration'
import {migrateProfiles} from './profile-migration'
async function main(){const config=readConfig(),db=new Database(config);try{for(const sql of schema) await db.execute(sql);await migrateUsernames(db);await migrateProfiles(db); await seed(db);console.log('Database schema and initial archive ready.')}finally{await db.pool.end()}}
main().catch(()=>{console.error('Migration failed. Check database connectivity and CREATE/ALTER permissions.');process.exitCode=1})
