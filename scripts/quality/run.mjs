import { spawn } from 'node:child_process'
export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    )
  })
}
export function pnpm(args, env = {}) {
  if (!process.env.npm_execpath) throw new Error('Run this command through pnpm.')
  return run(process.execPath, [process.env.npm_execpath, ...args], { env: { ...process.env, ...env } })
}
