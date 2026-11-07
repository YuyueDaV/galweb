import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { access, unlink, mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Platform, type Actor } from '../src/platform'
import { Assets } from '../src/assets'

test('图片去重、私有审核、永久删除与回滚恢复及注销保护', { skip: process.env.AUTH_INTEGRATION !== '1' }, async () => {
  const config = readConfig()
  assert.match(config.DB_NAME, /_test$/)
  const db = new Database(config), platform = new Platform(db), assets = new Assets(db, platform)
  const actors: Actor[] = []
  try {
    for (const role of ['admin', 'member', 'member']) {
      const id = randomUUID(), email = id + '@example.com'
      await db.execute('INSERT INTO users(id,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)', [id, email, email, role, 'unused-test-password-hash', role, Date.now(), Date.now()])
      actors.push({ id, nickname: role, role, status: 'active' })
    }
    const [admin, member, other] = actors as [Actor, Actor, Actor]
    const image = await sharp({ create: { width: 37, height: 39, channels: 3, background: '#ab784d' } }).png().toBuffer()
    const [first, retry] = await Promise.all([assets.create(member, image), assets.create(member, image)])
    assert.equal(first.id, retry.id)
    assert.equal((await db.rows('SELECT id FROM assets WHERE user_id=?', [member.id])).length, 1)
    assert.notEqual((await assets.create(other, image)).id, first.id)
    await assets.hide(admin, first.id)
    await assert.rejects(() => assets.file(first.id), /不存在/)
    await access(await assets.adminFile(admin, first.id))
    await assert.rejects(() => assets.adminFile(member, first.id), /管理员/)
    await assert.rejects(() => assets.moderate(member, first.id, 'active'), /管理员/)
    const reupload = await assets.create(member, image)
    assert.notEqual(reupload.id, first.id, '不得通过上传复用或恢复已隐藏的记录')
    await assets.moderate(admin, first.id, 'active')
    await access(await assets.file(first.id))
    await assets.hide(admin, reupload.id)
    await unlink(await assets.adminFile(admin, reupload.id))
    await assert.rejects(() => assets.moderate(admin, reupload.id, 'active'), /文件已丢失/)
    await assert.rejects(() => assets.remove(member, first.id), /管理员/)
    await assert.rejects(() => assets.remove(admin, '../invalid-id'), /不存在/)
    await db.execute('UPDATE users SET avatar_asset_id=? WHERE id=?', [first.id, member.id])
    // Rollback after staging must restore both the file and the avatar/record.
    let failTransaction = true
    const failingDb = {
      rows: db.rows.bind(db), execute: db.execute.bind(db),
      transaction: (run: Parameters<Database['transaction']>[0]) => db.transaction(async tx => {
        const result = await run(tx)
        if (failTransaction) { failTransaction = false; throw new Error('simulated transaction failure') }
        return result
      }),
    } as unknown as Database
    await assert.rejects(() => new Assets(failingDb, new Platform(failingDb)).remove(admin, first.id), /simulated/)
    await access(await assets.file(first.id))
    assert.equal((await db.rows<{avatar_asset_id:string}>('SELECT avatar_asset_id FROM users WHERE id=?', [member.id]))[0]!.avatar_asset_id, first.id)
    await assets.remove(admin, first.id)
    assert.equal((await db.rows('SELECT id FROM assets WHERE id=?', [first.id])).length, 0)
    assert.equal((await db.rows<{avatar_asset_id:null}>('SELECT avatar_asset_id FROM users WHERE id=?', [member.id]))[0]!.avatar_asset_id, null)
    await assert.rejects(() => access(path.join(assets.directory, first.id + '.webp')))
    await assert.rejects(() => assets.adminFile(admin, first.id), /不存在/)
    await assets.remove(admin, first.id) // Retrying a completed deletion is safe.
    await assets.remove(admin, reupload.id) // Missing-file records can be deleted.
    const recoverable = await assets.create(member, image)
    const trash = path.join(assets.directory, '.trash')
    await mkdir(trash, {recursive:true})
    await rename(path.join(assets.directory, recoverable.id + '.webp'), path.join(trash, recoverable.id + '.webp'))
    const committed = randomUUID()
    await writeFile(path.join(trash, committed + '.webp'), image)
    await assets.cleanupPendingDeletes()
    await access(await assets.file(recoverable.id))
    await assert.rejects(() => access(path.join(trash, committed + '.webp')))
    assert.ok((await db.rows('SELECT id FROM audit_logs WHERE action=?', ['永久删除图片 ' + first.id])).length)
    await assets.hide(admin, recoverable.id)
    await db.execute("UPDATE users SET status='deleted' WHERE id=?", [member.id])
    await assert.rejects(() => assets.moderate(admin, recoverable.id, 'active'), /已注销/)
    await assert.rejects(() => assets.adminFile(admin, recoverable.id), /不存在/)
    await assets.remove(admin, recoverable.id) // Deleted-account records also remain removable.
    await db.execute("UPDATE users SET role='member' WHERE id=?", [admin.id])
    await assert.rejects(() => assets.moderate(admin, first.id, 'active'), /管理员/)
    await assert.rejects(() => assets.adminFile(admin, first.id), /管理员/)
    await assert.rejects(() => assets.remove(admin, first.id), /管理员/)
  } finally {
    for (const actor of actors) {
      const rows = await db.rows<{ id: string }>('SELECT id FROM assets WHERE user_id=?', [actor.id])
      for (const row of rows) await unlink(assets.directory + '/' + row.id + '.webp').catch(() => {})
    }
    await db.pool.end()
  }
})
