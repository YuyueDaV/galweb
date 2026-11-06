import { pnpm } from './run.mjs'
for (const script of [
  'rules:check',
  'lint',
  'format:check',
  'typecheck',
  'test',
  'build:check',
  'test:e2e',
]) {
  console.log(`\n[quality] ${script}`)
  await pnpm(['run', script])
}
