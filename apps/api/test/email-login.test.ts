import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { HttpException } from '@nestjs/common'
import { readConfig } from '../src/config'
import { Database } from '../src/database'
import { Auth } from '../src/auth'
import { Mailer } from '../src/mail'
import { hashPassword, emailKey } from '../src/security'

async function withAccount(
  run: (data: {
    db: Database
    auth: Auth
    id: string
    username: string
    email: string
    password: string
  }) => Promise<void>,
) {
  const config = readConfig()
  assert.match(config.DB_NAME, /_test$/)
  assert.equal(config.MAIL_TRANSPORT, 'capture')
  const db = new Database(config),
    auth = new Auth(db, config, new Mailer(config)),
    id = randomUUID()
  const username = 'email_' + id.replaceAll('-', '').slice(0, 12)
  const email = `member.${id.slice(0, 8)}+tag@${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}.example.com`
  const password = 'Email login test password 2026!'
  try {
    await auth.initialize()
    await db.execute(
      'INSERT INTO users(id,username,username_key,email,email_key,nickname,password_hash,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        id,
        username,
        username,
        email,
        emailKey(email),
        '仅展示的昵称',
        await hashPassword(password),
        Date.now(),
        Date.now(),
      ],
    )
    await run({ db, auth, id, username, email, password })
  } finally {
    await db.execute('DELETE FROM auth_sessions WHERE user_id=?', [id])
    await db.execute('DELETE FROM users WHERE id=?', [id])
    await db.pool.end()
  }
}
function unauthorized(error: unknown) {
  assert.ok(error instanceof HttpException)
  assert.equal(error.getStatus(), 401)
  assert.equal(error.message, '账号或密码错误，或账号不可用。')
  return true
}

test(
  '邮箱与用户名指向相同账号，忽略大小写和首尾空白但保留点和加号，停用及注销均不能登录',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    await withAccount(async ({ db, auth, id, username, email, password }) => {
      assert.ok(email.length > 128)
      const byName = await auth.login(username.toUpperCase(), password, id)
      const byEmail = await auth.login('  ' + email.toUpperCase() + '  ', password, id)
      assert.equal(byName.user.id, id)
      assert.equal(byEmail.user.id, id)
      assert.equal((await auth.session(byEmail.session)).username, username)
      await assert.rejects(() => auth.login(email, 'wrong password', id), unauthorized)
      await assert.rejects(() => auth.login(email.replace('+tag', ''), password, id), unauthorized)
      await assert.rejects(() => auth.login(email.replace('member.', 'member'), password, id), unauthorized)
      await assert.rejects(() => auth.login('missing-' + email, password, id), unauthorized)
      await assert.rejects(() => auth.login('仅展示的昵称', password, id), unauthorized)
      for (const status of ['disabled', 'deleted']) {
        await db.execute('UPDATE users SET status=? WHERE id=?', [status, id])
        await assert.rejects(() => auth.login(username, password, id), unauthorized)
        await assert.rejects(() => auth.login(email, password, id), unauthorized)
      }
      const [count] = await db.rows<{ count: number }>(
        'SELECT COUNT(*) count FROM auth_sessions WHERE user_id=?',
        [id],
      )
      assert.equal(count!.count, 2)
    })
  },
)

test(
  '轮换用户名、邮箱及 IP 仍共享账号的十次登录尝试额度',
  { skip: process.env.AUTH_INTEGRATION !== '1' },
  async () => {
    await withAccount(async ({ auth, username, email, password, id }) => {
      for (let i = 0; i < 10; i++)
        await assert.rejects(
          () => auth.login(i % 2 ? email : username, 'wrong password', id + i),
          unauthorized,
        )
      for (const identifier of [username, email.toUpperCase()]) {
        await assert.rejects(
          () => auth.login(identifier, password, id + '-other-ip'),
          (error) => {
            assert.ok(error instanceof HttpException)
            assert.equal(error.getStatus(), 429)
            return true
          },
        )
      }
    })
  },
)
