import { spawn } from 'node:child_process'
import { access, mkdir, writeFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { run } from './run.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const mysql = createRequire(new URL('../../apps/api/package.json', import.meta.url))('mysql2/promise')
const children = []
const workspace = path.join(root, '.data/e2e')
const cwd = path.join(workspace, 'run-' + randomUUID().slice(0, 8))
const port = 33317
const database = 'galweb_e2e_' + randomUUID().replaceAll('-', '').slice(0, 12) + '_test'
const origin = 'http://127.0.0.1:3117'
await mkdir(cwd, { recursive: true })
const env = {
  ...process.env,
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: '3217',
  WEB_ORIGIN: origin,
  DB_HOST: '127.0.0.1',
  DB_PORT: String(port),
  DB_USER: 'root',
  DB_PASSWORD: '',
  DB_NAME: database,
  AUTH_SECRET: 'isolated-browser-tests-only-'.repeat(4),
  MAIL_TRANSPORT: 'capture',
  SMTP_PASSWORD: '',
}
let connection
let closing = false
async function close() {
  if (closing) return
  closing = true
  if (connection && process.env.CZX_E2E_EXTERNAL_DB !== '1') {
    await Promise.race([
      (async () => {
        const [rows] = await connection.query('SELECT @@datadir AS directory')
        if (path.resolve(rows[0].directory).toLowerCase() === path.resolve(workspace, 'mysql').toLowerCase())
          await connection.query('SHUTDOWN')
      })().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ])
  }
  if (connection)
    await Promise.race([
      connection.end().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ])
  for (const child of [...children].reverse()) child.kill()
}
process.once('SIGTERM', () => void close().then(() => process.exit()))
process.once('SIGINT', () => void close().then(() => process.exit()))
function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', ...options })
  children.push(child)
  child.on('error', (error) => {
    console.error(error.message)
    void close().then(() => process.exit(1))
  })
  child.on('exit', () => {
    if (!closing) void close().then(() => process.exit(1))
  })
  return child
}
async function ready(check, label) {
  for (let i = 0; i < 150; i++) {
    try {
      if (await check()) return
    } catch {
      /* Startup can take a few seconds. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`${label} did not start`)
}
try {
  await access(path.join(root, 'apps/web/.output-check/server/index.mjs')).catch(() => {
    throw new Error('Run pnpm build:check before browser tests.')
  })
  if (process.env.CZX_E2E_EXTERNAL_DB === '1') {
    if (!process.env.CI)
      throw new Error('External test databases are supported only in isolated CI services.')
  } else {
    const binary =
      process.env.CZX_MYSQL_BIN ||
      (process.platform === 'win32'
        ? 'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe'
        : '/usr/sbin/mysqld')
    await access(binary).catch(() => {
      throw new Error('Set CZX_MYSQL_BIN to your MySQL server executable.')
    })
    const data = path.join(workspace, 'mysql')
    await mkdir(data, { recursive: true })
    if (
      !(await access(path.join(data, 'mysql')).then(
        () => true,
        () => false,
      ))
    ) {
      await run(binary, ['--no-defaults', '--initialize-insecure', '--datadir=' + data], { cwd, env })
    }
    start(binary, [
      '--no-defaults',
      '--datadir=' + data,
      '--port=' + port,
      '--bind-address=127.0.0.1',
      '--mysqlx=OFF',
      '--console',
    ])
  }
  await ready(async () => {
    connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
    return true
  }, 'Isolated MySQL')
  await connection.query('CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4')
  await run(process.execPath, [path.join(root, 'apps/api/dist/migrate.js')], { cwd, env })
  const api = path.join(root, 'apps/api')
  const integrationFiles = (await readdir(path.join(api, 'test')))
    .filter((name) => name.endsWith('.test.ts'))
    .map((name) => path.join(api, 'test', name))
  await run(
    process.execPath,
    [path.join(api, 'node_modules/tsx/dist/cli.mjs'), '--test', '--test-concurrency=1', ...integrationFiles],
    { cwd: api, env: { ...env, AUTH_INTEGRATION: '1' } },
  )
  // Staff accounts and an open campaign are fixtures; participation uses real UI/API requests.
  const campaign = {
    id: 'browser-voting',
    edition: 999,
    title: '浏览器测试十二橙器',
    phase: 'nomination',
    nominationLimit: 1,
    voteLimit: 1,
    winnerCount: 1,
    nominationStart: null,
    nominationEnd: null,
    votingStart: null,
    votingEnd: null,
    createdAt: new Date().toISOString(),
    version: 0,
  }
  await connection.query('INSERT INTO `' + database + '`.award_campaigns(id,edition,data) VALUES (?,?,?)', [
    campaign.id,
    campaign.edition,
    JSON.stringify(campaign),
  ])
  const { hashPassword } = createRequire(import.meta.url)(path.join(root, 'apps/api/dist/security.js'))
  // Integration tests leave historical users in this isolated database. Keep exactly
  // two active owners for the self-demotion and last-owner browser checks.
  await connection.query('UPDATE `' + database + "`.users SET role='admin' WHERE role='super_admin'")
  for (const username of ['browser_owner', 'browser_owner_other', 'browser_member', 'browser_auth']) {
    const email = username + '@example.com'
    await connection.query(
      'INSERT INTO `' +
        database +
        '`.users(id,username,username_key,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        randomUUID(),
        username,
        username,
        email,
        email,
        username,
        await hashPassword('Isolated moderator password 123!'),
        username.startsWith('browser_owner') ? 'super_admin' : 'member',
        Date.now(),
        Date.now(),
      ],
    )
  }
  const editorId = randomUUID()
  await connection.query(
    'INSERT INTO `' +
      database +
      '`.users(id,username,username_key,email,email_key,nickname,password_hash,role,email_verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [
      editorId,
      'browser_editor',
      'browser_editor',
      'editor@example.com',
      'editor@example.com',
      '测试编辑',
      await hashPassword('Isolated editor password 123!'),
      'admin',
      Date.now(),
      Date.now(),
    ],
  )
  await writeFile(path.join(workspace, 'active.json'), JSON.stringify({ cwd, database, origin }))
  start(process.execPath, [path.join(root, 'apps/api/dist/main.js')])
  await ready(async () => (await fetch('http://127.0.0.1:3217/api/health')).ok, 'Test API')
  start(process.execPath, [path.join(root, 'apps/web/.output-check/server/index.mjs')], {
    env: {
      ...env,
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: '3117',
      NUXT_API_BASE: 'http://127.0.0.1:3217',
      NUXT_PUBLIC_SITE_URL: origin,
    },
  })
  console.log('[e2e] Isolated API, mail capture and MySQL ready.')
} catch (error) {
  console.error(error.message)
  await close()
  process.exit(1)
}
