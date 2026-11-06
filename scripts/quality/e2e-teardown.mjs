import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export default async function teardown() {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const state = JSON.parse(await readFile(path.join(root, '.data/e2e/active.json'), 'utf8'))
  if (!/^galweb_e2e_[a-f0-9]{12}_test$/.test(state.database)) throw new Error('Unexpected test database name')
  const mysql = createRequire(new URL('../../apps/api/package.json', import.meta.url))('mysql2/promise')
  const connection = await mysql
    .createConnection({ host: '127.0.0.1', port: 33317, user: 'root', password: '' })
    .catch(() => null)
  if (!connection) return
  try {
    const [rows] = await connection.query('SELECT @@datadir AS directory')
    if (process.env.CZX_E2E_EXTERNAL_DB !== '1') {
      const expected = path.resolve(root, '.data/e2e/mysql').toLowerCase()
      if (path.resolve(rows[0].directory).toLowerCase() !== expected)
        throw new Error('Refusing to clean a database outside the test workspace')
    } else if (!process.env.CI) throw new Error('External databases are restricted to CI')
    await connection.query('DROP DATABASE `' + state.database + '`')
    if (process.env.CZX_E2E_EXTERNAL_DB !== '1') await connection.query('SHUTDOWN')
  } finally {
    await connection.end().catch(() => {})
  }
}
