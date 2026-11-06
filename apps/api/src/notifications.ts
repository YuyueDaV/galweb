import {randomUUID} from 'node:crypto'
import type {PoolConnection} from 'mysql2/promise'
import {Database} from './database'

export async function notifyUser(db:Database,userId:string|null,kind:string,title:string,link:string,tx:PoolConnection,postId:string|null=null,replyId:string|null=null){
 if(!userId)return
 await db.execute("INSERT INTO notifications(id,user_id,kind,title,link,post_id,reply_id,created_at) SELECT ?,id,?,?,?,?,?,? FROM users WHERE id=? AND status='active'",[randomUUID(),kind,title.slice(0,160),link,postId,replyId,Date.now(),userId],tx)
}
