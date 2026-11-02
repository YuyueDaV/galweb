import {Database} from './database'

export async function migrateProfiles(db:Database){
 const columns=await db.rows<{COLUMN_NAME:string,COLUMN_TYPE:string}>("SELECT COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'")
 const names=new Set(columns.map(c=>c.COLUMN_NAME))
 if(!names.has('signature'))await db.execute("ALTER TABLE users ADD COLUMN signature VARCHAR(120) NOT NULL DEFAULT ''")
 if(!names.has('avatar_asset_id'))await db.execute('ALTER TABLE users ADD COLUMN avatar_asset_id CHAR(36) NULL')
 if(!names.has('deleted_at'))await db.execute('ALTER TABLE users ADD COLUMN deleted_at BIGINT NULL')
 if(!columns.find(c=>c.COLUMN_NAME==='status')?.COLUMN_TYPE.includes("'deleted'"))await db.execute("ALTER TABLE users MODIFY COLUMN status ENUM('active','disabled','deleted') NOT NULL DEFAULT 'active'")
}
