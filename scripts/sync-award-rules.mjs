import { readFile, writeFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const header = '// Generated from packages/domain by scripts/sync-award-rules.mjs. Do not edit.\n'
const outputs = {
  'apps/api/src/award-types.ts': header + await readFile(new URL('packages/domain/award-types.ts', root), 'utf8'),
  'apps/api/src/award-rules.ts': header + await readFile(new URL('packages/domain/award-rules.ts', root), 'utf8'),
  'apps/web/app/types/awards.ts': header + "export type * from '../../../../packages/domain/award-types'\n",
  'apps/web/app/utils/awards.ts': header + "export * from '../../../../packages/domain/award-rules.ts'\nexport * from './award-time.ts'\n",
}
for (const [name, text] of Object.entries(outputs)) {
  const url = new URL(name, root)
  if (process.argv.includes('--check')) {
    if (await readFile(url, 'utf8').catch(() => '') !== text) throw new Error(`${name} is out of sync. Run pnpm rules:sync.`)
  } else await writeFile(url, text)
}
console.log('Shared award rules are synchronized.')
