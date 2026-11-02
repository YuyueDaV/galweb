import {Database} from './database'
import {usernameKey,validUsername} from './identity'
export async function migrateUsernames(db:Database){
 const columns=await db.rows<{COLUMN_NAME:string}>("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'")
 const names=new Set(columns.map(c=>c.COLUMN_NAME))
 if(!names.has('username'))await db.execute('ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL')
 if(!names.has('username_key'))await db.execute('ALTER TABLE users ADD COLUMN username_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL')
 const rows=await db.rows<{id:string,username:string|null,nickname:string}>('SELECT id,username,nickname FROM users WHERE status<>\'deleted\' AND (username IS NULL OR username_key IS NULL) ORDER BY created_at,id')
 for(const row of rows){let username=row.username||(validUsername(row.nickname)?row.nickname:`u_${row.id.replace(/-/g,'').slice(0,20)}`);let key=usernameKey(username);let attempt=0;while((await db.rows('SELECT id FROM users WHERE username_key=? AND id<>?',[key,row.id])).length){username=`u_${row.id.replace(/-/g,'').slice(0,16)}_${++attempt}`;key=usernameKey(username)}await db.execute('UPDATE users SET username=?,username_key=? WHERE id=?',[username,key,row.id])}
 const indexes=await db.rows("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND INDEX_NAME='users_username_key_unique'")
 if(!indexes.length)await db.execute('ALTER TABLE users ADD UNIQUE KEY users_username_key_unique(username_key)')
 console.log(`Login-name migration ready; ${rows.length} legacy accounts assigned or normalized.`)
}
