# 账号后端运行说明

已实现 `apps/api`：NestJS + MySQL + SMTP，不需要 Redis。包含邮箱验证码注册、用户名密码登录、会话查询/退出、CSRF 凭证恢复、邮箱验证码重置密码。前端登录、论坛和评选已接入真实 API；完整运行步骤见 [运行与部署](deployment.md)。

## 本机配置

在 MySQL 中为项目创建独立数据库和专用用户，字符集 utf8mb4。先在 `apps/api` 下将 `.env.example` 复制为 `.env`，填写 DB_*；生成至少 32 字节随机值作为 AUTH_SECRET。`.env` 已被忽略，不要提交。程序不会自动创建数据库，也不会改变现有 MySQL 用户。

```powershell
pnpm install
pnpm --filter @chengzhixiang/api migrate
pnpm --filter @chengzhixiang/api build
pnpm --filter @chengzhixiang/api start
```

默认 API 地址 `http://127.0.0.1:3200`。`GET /api/health` 会检查数据库连接。

开发时 `MAIL_TRANSPORT=capture` 将邮件保存到 `apps/api/.data/mail/<challengeId>.json`。文件仅供本机开发者查看，不会通过 HTTP 提供，也不会出现在 API 返回值或日志中。真实发信设置 `MAIL_TRANSPORT=smtp`，填写 SMTP_HOST、SMTP_PORT、SMTP_SECURE、SMTP_USER、SMTP_PASSWORD、MAIL_FROM。SMTP 465 通常使用 SMTP_SECURE=true；587 通常为 false 并要求 STARTTLS，最终以服务商配置为准。生产模式禁止 capture，要求 HTTPS WEB_ORIGIN。

QQ／Foxmail 可使用下列配置；账号和授权码仅填写本机 `.env`，不要提交：

```dotenv
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的完整邮箱地址
SMTP_PASSWORD=邮箱设置中生成的SMTP授权码
MAIL_FROM=你的完整邮箱地址
```

在 QQ 邮箱中开启 SMTP 并获取授权码。`SMTP_PASSWORD` 填授权码，`MAIL_FROM` 与发信账号保持一致。先执行连接检查，不会发送邮件：

```powershell
pnpm --filter @chengzhixiang/api mail:check
```

需要确认实际投递时，向自己指定的邮箱发送一封不含注册验证码的测试邮件：

```powershell
pnpm --filter @chengzhixiang/api mail:test 你的测试收件邮箱
```

这两个命令始终检查真实 SMTP，独立于网页当前的 capture 模式。检查通过后，将 `.env` 中的 `MAIL_TRANSPORT` 改为 `smtp` 并重启 API，网页注册和找回密码即使用真实发信。SMTP 接受邮件不等于收件箱已收到，请同时检查垃圾邮件。诊断仅输出中文说明，不回显授权码、验证码或服务商原始响应。

## 接口

所有 POST 请求需要 `Content-Type: application/json` 和与 WEB_ORIGIN 完全一致的 Origin。前端 fetch 使用 `credentials: 'include'`。生产通过同站 HTTPS 反向代理部署；服务不信任任意 X-Forwarded-For，代理部署前应按实际受信代理地址配置 IP 解析，避免所有用户共用代理 IP 限额。

| 方法与路径 | 请求 / 返回 |
| --- | --- |
| POST /api/auth/registration-code | `{email}` → `{challengeId,retryAfter,message}` |
| POST /api/auth/register | `{challengeId,username,email,password,confirmPassword,code}` → 注册成功提示 |
| POST /api/auth/login | `{username,password}` → `{user,csrfToken}`，同时设置 HttpOnly 会话 Cookie |
| GET /api/auth/me | Cookie → `{user}`，角色来自数据库 |
| PATCH /api/auth/me | Cookie、X-CSRF-Token、`{nickname}` → 更新展示昵称；用户名不可修改 |
| DELETE /api/auth/me | Cookie、X-CSRF-Token、`{password,confirmation:"注销账号"}` → 注销当前账号并清除 Cookie；不能指定其他用户 ID |
| POST /api/auth/csrf | Cookie，空 JSON `{}` → 当前会话的 csrfToken；多标签页共享，不互相使对方失效 |
| POST /api/auth/logout | Cookie、X-CSRF-Token、空 JSON `{}` → 撤销会话 |
| POST /api/auth/password-reset/request | `{email}` → `{challengeId,retryAfter,message}` |
| POST /api/auth/password-reset/confirm | `{challengeId,email,code,password,confirmPassword}` → 更新密码并撤销该用户所有会话 |

注册字段顺序为用户名、邮箱、密码、确认密码、验证码。用户名 3–24 位中文、字母、数字或下划线，规范化后唯一（NFKC + 小写），是固定登录 ID；昵称为独立的社区展示名称，默认使用用户名，登录后可设置为 1–24 字符。内部 UUID 保持不变，用于关联帖子与选票。密码长度 12–128 字符，注册和重置密码均要求二次输入一致；确认失败不消费验证码。验证码 6 位、5 分钟有效、最多失败 5 次。同邮箱发码至少间隔 60 秒、每日最多 10 次；同 IP 每分钟最多 10 次、每日 100 次。注册与找回密码共享发码限额。

`pnpm db:migrate` 会幂等补齐 username / username_key 和唯一索引。已有账号的 UUID、密码、邮箱、角色及昵称保持不变；优先使用有效且未占用的原昵称分配登录名，否则分配 `u_…` 登录名。管理员账号列表会显示登录名。新注册用户必须提供用户名，不能再使用邮箱或修改后的昵称登录。

邮箱账户按 ASCII 大小写不敏感比较，保留点和加号后缀；目前不支持国际化邮箱地址。注册接口拒绝额外字段（包括 role），新用户恒为 member。首名超级管理员通过 admin:bootstrap 命令引导，后续通过管理界面分配角色，服务端保护最后一名有效超级管理员。

## 自主注销

用户中心底部提供独立的注销区域。展开后展示影响范围，要求当前密码和“注销账号”确认文字。成功后撤销所有设备会话，清除本机用户缓存并返回首页；失败保留账号并显示原因。每个账号 10 分钟最多 5 次注销请求。

- `users` 清除原用户名、邮箱、昵称、签名、头像引用和密码哈希，保留原 UUID、匿名占位记录及 `deleted_at`，状态为 `deleted`。这样可维持历史内容外键关系；管理员不能启用或改权恢复该记录。
- 公开帖子和回复匿名保留。清除点赞、收藏和选票；已通过提名匿名保留，以免破坏其他用户的候选和选票，待审核提名自动撤回。已公布结果只修改提名者身份字段，不重新计算票数、名次或当时的选票总数。
- 上传图片立即停止从服务端提供，随后清理文件和元信息；失败的文件清理会在服务启动及定时维护中重试。
- 原验证码立即作废。短期验证记录和请求频率计数按原过期策略清理，注销不会重置邮件、登录限流；重新注册仍需获取新验证码，遵守 60 秒间隔及每日限额。
- 同一邮箱和用户名可重新注册，但新账号具有全新 UUID，默认普通成员，不继承历史帖子所有权、角色、选票或会话。最后一名有效超级管理员必须先交接给其他超级管理员才能注销。

历史备份和本地开发捕获邮件按各自保留策略管理，注销操作不改写备份。

验证码使用 HMAC 存储，密码使用带独立盐的 scrypt，登录凭证只存 SHA-256 校验值。会话 7 天有效，登录时替换浏览器旧会话。验证码、限流与会话的有效性由每次请求检查；小时清理任务只负责删除过期行。AUTH_SECRET 变更会使已有验证码失效。

邮件发送为同步 SMTP，失败时记录不含邮箱或验证码的 challengeId，对外保持一致提示，不暴露账号是否存在；SMTP 接受邮件不保证已送达。生产规模扩大后可增加持久化发信队列和投递监控。

## 验证

帖子卡片的浏览数来自 `forum_post_metrics`，只在前端进入详情页后通过 `POST /api/posts/:id/views` 记录；列表、回复读取和点赞刷新不增加浏览数。`forum_view_receipts` 使用服务端密钥对来源 IP 与 User-Agent 生成 HMAC，同一来源对同一帖子 30 分钟内计一次；不保存原始 IP 或 User-Agent，过期去重记录由小时维护任务清理。此数为浏览次数，不能视为准确的独立访客数。新表通过 `pnpm db:migrate` 创建，旧帖子从 0 开始累计。

回复数只统计已发布回复。收藏通过登录账号持久存储，登录后同步，未登录点击会打开登录弹窗；提交期间禁用重复点击，失败保持原状态并显示错误。

```powershell
pnpm --filter @chengzhixiang/api typecheck
pnpm --filter @chengzhixiang/api test
```

默认运行安全函数测试，数据库集成测试明确标记为跳过。真实 MySQL 集成测试需专用测试库（名称必须以 `_test` 结尾）、MAIL_TRANSPORT=capture，并设置 AUTH_INTEGRATION=1 后运行同一命令。测试会写入独立的随机邮箱账号，不应指向正式库。

集成测试覆盖验证码失败次数持久化、同码并发注册只成功一次、唯一邮箱、默认成员角色、登录错误、CSRF 校验、用途隔离、改密撤销会话和退出失效。

2026-10-31 已使用隔离的 MySQL 8.0.46 实例执行数据库与 HTTP 集成测试，4 个后端测试用例全部通过；前后端类型检查、生产构建和既有 9 项评选规则测试通过。邮件测试使用 capture 模式，尚未验证真实 SMTP 投递。隔离测试库与正式配置分开，未修改本机已有数据库。

2026-11-02 已完成 QQ／Foxmail SMTP 的 TLS 连接、身份认证与实际测试发信，SMTP 服务确认接受测试邮件；网页账号服务已切换为 SMTP。发信邮箱和授权码仅保存在本机 `.env`，不进入配置模板。完整隔离测试共 26 项通过，包含注册与找回密码、SMTP 适配器、失败诊断及凭证不回显检查。SMTP 接受与收件箱实际收到需分别确认。
