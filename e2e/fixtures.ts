import { test as base } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export * from '@playwright/test'

const root = fileURLToPath(new URL('../', import.meta.url))
const mysql = createRequire(new URL('../apps/api/package.json', import.meta.url))('mysql2/promise')

export const test = base.extend<{ isolatedRateLimits: void }>({
  isolatedRateLimits: [
    async ({ baseURL }, use) => {
      if (baseURL !== 'http://127.0.0.1:3117') throw new Error('Unexpected browser test origin')
      const state = JSON.parse(await readFile(path.join(root, '.data/e2e/active.json'), 'utf8'))
      if (!/^galweb_e2e_[a-f0-9]{12}_test$/.test(state.database))
        throw new Error('Unexpected browser test database')
      const connection = await mysql.createConnection({
        host: '127.0.0.1',
        port: 33317,
        user: 'root',
        password: '',
        database: state.database,
      })
      try {
        const [rows] = await connection.query('SELECT @@datadir AS directory')
        if (process.env.CZX_E2E_EXTERNAL_DB === '1') {
          if (!process.env.CI) throw new Error('External test databases are restricted to CI')
        } else if (
          path.resolve(rows[0].directory).toLowerCase() !==
          path.resolve(root, '.data/e2e/mysql').toLowerCase()
        ) {
          throw new Error('Refusing to reset limits outside the isolated test database')
        }
        // Each scenario gets a fresh rate budget. Real API rate-limit tests run
        // before browser fixtures, and limits still apply within every scenario.
        await connection.execute('DELETE FROM auth_rate_limits')
      } finally {
        await connection.end()
      }
      await use()
    },
    { auto: true },
  ],
})
