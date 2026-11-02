import 'dotenv/config'
import { z } from 'zod'
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'), API_PORT: z.coerce.number().int().min(1).max(65535).default(3200),
  WEB_ORIGIN: z.url(), DB_HOST: z.string().default('127.0.0.1'), DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1), DB_PASSWORD: z.string(), DB_NAME: z.string().regex(/^[a-zA-Z0-9_]+$/),
  AUTH_SECRET: z.string().min(64), MAIL_TRANSPORT: z.enum(['smtp','capture']).default('smtp'),
  SMTP_HOST: z.string().trim().default(''), SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587), SMTP_SECURE: z.enum(['true','false']).default('false'),
  SMTP_USER: z.string().trim().default(''), SMTP_PASSWORD: z.string().default(''), MAIL_FROM: z.string().trim().default(''),
  TRUST_PROXY: z.string().default('loopback'),
})
export type Config = z.infer<typeof schema>
export function readConfig(): Config {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) throw new Error('Invalid configuration: ' + parsed.error.issues.map(i=>i.path.join('.')).join(', '))
  const c=parsed.data
  if(c.NODE_ENV==='production' && (c.MAIL_TRANSPORT!=='smtp' || !c.WEB_ORIGIN.startsWith('https://'))) throw new Error('Production requires SMTP and HTTPS WEB_ORIGIN')
  if(c.MAIL_TRANSPORT==='smtp' && [c.SMTP_HOST,c.SMTP_USER,c.SMTP_PASSWORD,c.MAIL_FROM].some(v=>!v)) throw new Error('SMTP configuration is incomplete')
  if(new URL(c.WEB_ORIGIN).origin!==c.WEB_ORIGIN) throw new Error('WEB_ORIGIN must be an origin without a trailing slash')
  return c
}
