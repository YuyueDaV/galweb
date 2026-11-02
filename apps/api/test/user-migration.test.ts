import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readConfig} from '../src/config'
import {Database} from '../src/database'
import {migrateUsernames} from '../src/user-migration'
import {usernameKey,validUsername} from '../src/identity'
test('用户名规则：大小写与全角规范化，支持中文，拒绝邮箱和空格',()=>{assert.equal(usernameKey(' ＡＢＣ_123 '),'abc_123');assert.equal(validUsername('视觉小说同好'),true);assert.equal(validUsername('ab'),false);assert.equal(validUsername('foo bar'),false);assert.equal(validUsername('a@example.com'),false)})
test('用户名迁移：保留 UUID 和昵称、处理重名、重复执行稳定',{skip:process.env.AUTH_INTEGRATION!=='1'},async()=>{
 const c=readConfig();assert.match(c.DB_NAME,/_test$/);const db=new Database(c),ids=[randomUUID(),randomUUID()],nickname='旧昵称_'+randomUUID().slice(0,8)
 try{for(const id of ids)await db.execute('INSERT INTO users(id,email,email_key,nickname,password_hash,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?)',[id,id+'@example.com',id+'@example.com',nickname,'unused-fixture-hash',Date.now(),Date.now()]);await migrateUsernames(db);const before=await db.rows<{id:string,username:string,nickname:string}>('SELECT id,username,nickname FROM users WHERE id IN (?,?) ORDER BY id',ids);assert.equal(before.length,2);assert.notEqual(usernameKey(before[0]!.username),usernameKey(before[1]!.username));assert.ok(before.every(u=>u.nickname===nickname&&ids.includes(u.id)));await migrateUsernames(db);assert.deepEqual(await db.rows('SELECT id,username,nickname FROM users WHERE id IN (?,?) ORDER BY id',ids),before)}finally{await db.pool.end()}
})
