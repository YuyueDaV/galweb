import { Database } from './database'

export async function migrateSocialAccounts(db: Database) {
  const columns = await db.rows<{ COLUMN_NAME: string; IS_NULLABLE: string }>(
    "SELECT COLUMN_NAME,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME IN ('email','email_key')",
  )
  if (columns.some((column) => column.COLUMN_NAME === 'email' && column.IS_NULLABLE === 'NO'))
    await db.execute('ALTER TABLE users MODIFY COLUMN email VARCHAR(254) NULL')
  if (columns.some((column) => column.COLUMN_NAME === 'email_key' && column.IS_NULLABLE === 'NO'))
    await db.execute(
      'ALTER TABLE users MODIFY COLUMN email_key VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NULL',
    )
}
