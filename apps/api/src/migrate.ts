import { readConfig } from './config'
import { Database } from './database'
import { schema } from './schema'
import { seed } from './seed'
import { migrateUsernames } from './user-migration'
import { migrateProfiles } from './profile-migration'
let step = 'configuration'
async function main() {
  const db = new Database(readConfig())
  try {
    for (const sql of schema) {
      step = `create table ${sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i)?.[1] || 'unknown'}`
      await db.execute(sql)
    }
    step = 'login-name migration'
    await migrateUsernames(db)
    step = 'profile migration'
    await migrateProfiles(db)
    step = 'initial archive'
    await seed(db)
    console.log('Database schema and initial archive ready.')
  } finally {
    await db.pool.end()
  }
}
main().catch((error: unknown) => {
  const failure = error as { code?: unknown; errno?: unknown }
  const code =
    typeof failure?.code === 'string' && /^[A-Z0-9_]+$/.test(failure.code) ? failure.code : 'UNKNOWN'
  const errno = typeof failure?.errno === 'number' ? failure.errno : 'unknown'
  // Do not print driver errors verbatim: they can include SQL values or credentials.
  console.error(`Migration failed at ${step}: ${code} (errno ${errno}).`)
  if (code === 'ER_FK_INCOMPATIBLE_COLUMNS') {
    console.error(
      'Foreign-key columns have incompatible types, character sets or collations. Check the schema charset declarations and existing column definitions.',
    )
  } else {
    console.error('Check configuration, database connectivity and CREATE/ALTER permissions.')
  }
  process.exitCode = 1
})
