import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { migrateSocialAccounts } from '../src/oauth-migration'

test(
  '第三方账号迁移：兼容旧表、重复执行保留邮箱及唯一约束、支持多个空邮箱',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    const config = readConfig()
    assert.match(config.DB_NAME, /_test$/)
    const name = 'galweb_oauth_' + randomUUID().replaceAll('-', '') + '_test'
    const admin = new Database(config)
    let fixture: Database | undefined
    try {
      await admin.pool.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4')
      fixture = new Database({ ...config, DB_NAME: name })
      await fixture.execute(
        'CREATE TABLE users(id CHAR(36) PRIMARY KEY,email VARCHAR(254) NOT NULL,email_key VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
      )
      await fixture.execute("INSERT INTO users VALUES ('existing','Member@example.com','member@example.com')")
      await migrateSocialAccounts(fixture)
      await migrateSocialAccounts(fixture)
      assert.deepEqual(await fixture.rows('SELECT email,email_key FROM users'), [
        { email: 'Member@example.com', email_key: 'member@example.com' },
      ])
      await fixture.execute("INSERT INTO users VALUES ('social1',NULL,NULL),('social2',NULL,NULL)")
      await assert.rejects(
        () =>
          fixture!.execute("INSERT INTO users VALUES ('duplicate','other@example.com','member@example.com')"),
        { code: 'ER_DUP_ENTRY' },
      )
      const index = await fixture.rows(
        "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='email_key' AND NON_UNIQUE=0",
      )
      assert.equal(index.length, 1)
    } finally {
      await fixture?.pool.end()
      await admin.pool.query('DROP DATABASE IF EXISTS `' + name + '`')
      await admin.pool.end()
    }
  },
)
