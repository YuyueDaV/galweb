import { pnpm } from './run.mjs'
await pnpm(['--filter', '@chengzhixiang/api', 'build'])
await pnpm(['--filter', '@chengzhixiang/web', 'build'], { CZX_CHECK: '1' })
