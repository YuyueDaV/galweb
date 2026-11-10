export type StartupStage = 'database' | 'authentication' | 'application' | 'listen'

export function startupDiagnostic(error: unknown, stage: StartupStage) {
  const details = error as { code?: unknown; errno?: unknown } | null
  const code = typeof details?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(details.code)
    ? details.code : undefined
  const errno = typeof details?.errno === 'number' && Number.isInteger(details.errno)
    ? details.errno : undefined
  const messages: Record<string, string> = {
    ER_ACCESS_DENIED_ERROR: '数据库账号或密码验证失败，请检查 API .env 中的 DB_USER 和 DB_PASSWORD。',
    ER_DBACCESS_DENIED_ERROR: '数据库账号没有访问目标数据库的权限，请检查 DB_NAME 和数据库授权。',
    ER_BAD_DB_ERROR: '目标数据库不存在，请检查 DB_NAME 并创建数据库。',
    ER_NO_SUCH_TABLE: '数据库缺少业务表，请核对目标数据库，再运行 pnpm db:migrate。',
    EADDRINUSE: 'API 端口已被占用，请先停止旧 API，或修改 API_PORT。',
    EACCES: '服务访问权限不足，请检查端口或本地运行环境的权限。',
  }
  const connectionFailure = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(code || '')
  const message = messages[code || ''] || (stage === 'database' && connectionFailure
    ? '无法连接数据库，请检查 MySQL 服务、DB_HOST 和 DB_PORT。'
    : `API 在 ${stage} 阶段启动失败，请检查当前配置和运行环境。`)
  // Never log the original message, stack, SQL, connection options or cause:
  // upstream errors may contain passwords, usernames or private configuration.
  return { stage, code, errno, message }
}
