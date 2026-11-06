import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createConnection } from 'mysql2/promise'
import { schema } from '../src/schema'

// Opt in against a disposable local MySQL instance; never use the application database.
for (const defaults of [
  'CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci',
  'CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
  'CHARACTER SET latin1 COLLATE latin1_swedish_ci',
]) {
  test(
    `建表：数据库默认 ${defaults} 时外键兼容且重复执行保留数据`,
    {
      skip: process.env.SCHEMA_INTEGRATION !== '1',
    },
    async () => {
      const port = Number(process.env.SCHEMA_TEST_PORT)
      assert.ok(Number.isInteger(port) && port > 0 && port <= 65535, '显式指定临时 MySQL 端口')
      const db = await createConnection({
        host: '127.0.0.1',
        port,
        user: 'root',
        charset: 'utf8mb4',
        password: process.env.SCHEMA_TEST_PASSWORD || '',
      })
      const name = `galweb_schema_${randomUUID().replace(/-/g, '')}_test`
      let created = false
      try {
        await db.query(`CREATE DATABASE \`${name}\` ${defaults}`)
        created = true
        await db.query(`USE \`${name}\``)

        // Reproduce the partially created database left by the original migration.
        for (const [index, sql] of schema.slice(0, 3).entries()) {
          await db.execute(index === 0 ? sql : sql.replace(/ DEFAULT CHARSET=utf8mb4$/, ''))
        }

        const id = randomUUID(),
          token = 'a'.repeat(64),
          nickname = '测试成员🍊'
        await db.execute(
          `INSERT INTO users
        (id,email,email_key,nickname,password_hash,email_verified_at,created_at)
        VALUES (?,?,?,?,?,?,?)`,
          [id, `${id}@example.com`, `${id}@example.com`, nickname, 'fixture', 1, 1],
        )
        for (const sql of schema) await db.execute(sql)
        await db.execute(
          `INSERT INTO auth_sessions
        (token_hash,user_id,csrf_hash,expires_at,created_at) VALUES (?,?,?,?,?)`,
          [token, id, 'b'.repeat(64), 2, 1],
        )

        for (const sql of schema) await db.execute(sql)
        const [rows] = await db.query('SELECT nickname FROM users WHERE id=?', [id])
        assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{ nickname }])
        const [sessions] = await db.query('SELECT user_id FROM auth_sessions WHERE token_hash=?', [token])
        assert.deepEqual(JSON.parse(JSON.stringify(sessions)), [{ user_id: id }])
        await assert.rejects(
          () =>
            db.execute(
              `INSERT INTO auth_sessions
        (token_hash,user_id,csrf_hash,expires_at,created_at) VALUES (?,?,?,?,?)`,
              ['c'.repeat(64), randomUUID(), 'd'.repeat(64), 2, 1],
            ),
          { code: 'ER_NO_REFERENCED_ROW_2' },
        )
      } finally {
        try {
          if (created) await db.query(`DROP DATABASE \`${name}\``)
        } finally {
          await db.end()
        }
      }
    },
  )
}
