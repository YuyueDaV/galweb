# 邮箱注册与账号方案

状态：邮箱注册、密码登录、会话与密码重置已在前后端接通，采用 MySQL 持久化。SMTP 适配器已实现，真实投递需要配置服务商凭证；开发可使用本地邮件捕获。启动与验收方式见 [账号后端运行说明](auth-setup.md)。

已确认需求：论坛必须支持邮箱注册。首版建议采用“邮箱验证码 + 设置密码”注册，注册后使用用户名和密码登录。邮箱找回密码作为同一账号模块的配套能力，实施时复用邮件发送基础设施，但验证凭证必须区分用途。

## 用户流程

1. 输入邮箱并请求注册验证码。
2. 后端检查格式和发送限额，生成随机验证码，通过配置的发信服务发送。
3. 注册表单按用户名、邮箱、密码、确认密码、验证码排列；用户名为固定登录 ID，昵称在注册后设置。
4. 后端校验对应的注册挑战、邮箱、有效期、尝试次数和使用状态，在事务中创建用户并消费该验证码。
5. 创建成功后提示用户登录。新注册账号只能是普通成员，不能通过注册参数获得管理员角色。

当前策略：6 位数字验证码、5 分钟有效、同一邮箱至少间隔 60 秒发送、单个挑战最多验证失败 5 次；同邮箱每日最多发送 10 次，同 IP 每分钟最多 10 次、每日 100 次。后续可根据服务商额度调整。重发成功后旧验证码失效。

验证码应使用密码学安全随机数生成，保存绑定挑战 ID、邮箱和用途的 HMAC 校验值，密钥只保留在服务端；不存明文验证码，不在日志或公开 API 中返回验证码。短数字验证码不宜只做无密钥的普通哈希。校验与消费必须原子执行，防止同一凭证并发使用。密码使用专门的密码哈希算法保存。

邮箱验证只证明能够接收该邮箱邮件，不证明是南京工程学院学生或社团成员。若以后需要成员专属投票，应另设成员资格、邀请或审核规则。

## 数据归属

首版可只使用 MySQL，不要求 Redis。

| 表 | 主要内容 |
| --- | --- |
| users | id、username、唯一 username_key、email、用于唯一比较的邮箱键、email_verified_at、nickname（默认用户名，注册后可设置）、password_hash、role、status、created_at；邮箱键唯一 |
| email_verification_challenges | id、email、purpose、code_hmac、expires_at、failed_attempts、consumed_at、delivery_status、created_at |
| auth_sessions | 随机会话凭证的校验摘要、user_id、expires_at、revoked_at、created_at |
| auth_rate_limits | 经适当保护的限流主体键、用途、时间窗口、请求计数；主体、用途、窗口联合唯一 |

邮箱比较规则在注册、登录、找回密码和数据库唯一约束中保持一致；保留原始邮箱用于发信，不擅自去掉本地部分的点或加号后缀。SMTP 接受发送不等于收件人已收到邮件，错误提示和重发流程需要保留。

验证时始终检查服务端时间与 consumed_at，定时清理过期记录只负责回收空间。并发发码、注册和限流需要数据库事务与唯一约束；注册竞争冲突不能产生两个账号。对于已注册邮箱的发码请求，对外采用一致提示，避免暴露账号是否存在；可在适当限流下向邮箱持有人提供登录或找回密码提示。

后续若增加 Redis，可迁移验证码、限流和会话存储。用户、角色、帖子、提名、选票和正式结果仍以 MySQL 为准。

## 接口草案

| 接口 | 用途 |
| --- | --- |
| POST /api/auth/registration-code | 接收 email，受限流约束发送注册邮件，返回 challengeId 和重试间隔，不返回验证码 |
| POST /api/auth/register | 接收 challengeId、username、email、password、confirmPassword、code；校验后在事务中创建普通成员并消费挑战 |
| POST /api/auth/login | 邮箱与密码登录，创建或轮换会话，通过 Cookie 返回会话凭证 |
| POST /api/auth/logout | 撤销当前会话并清除 Cookie |
| GET /api/auth/me | 返回本人的资料、可信角色及当前会话的 CSRF 令牌；只读，不延长或重建会话 |
| POST /api/auth/password-reset/request | 配套找回密码邮件，凭证与注册用途隔离 |
| POST /api/auth/password-reset/confirm | 校验专用重置凭证、更新密码并撤销既有会话 |

正式 HTTPS 环境使用 HttpOnly、Secure 和适当 SameSite 的会话 Cookie，写接口配合 CSRF 防护。不得使用 localStorage 中的体验身份作为正式授权依据。

页面刷新时，Nuxt 在服务端根据当前请求的 Cookie 恢复账号，首屏直接显示本人头像、昵称和对应菜单；水合后复用该状态，不重复请求身份。初始化请求仅在同一个 Nuxt 请求或浏览器标签页内合并，不跨账号共享。带账号信息的 HTML 使用 `private, no-store`，禁止公共缓存。旧会话或旧后端缺少 CSRF 令牌时，浏览器通过原 `/auth/csrf` 接口补充，期间保留已确认的账号显示。

接口短暂失败时保留已确认的账号，首次无法确认则显示等待或重试入口；只有服务端明确返回 401 才清除登录状态。退出、注销、重新登录后，迟到的旧身份请求不能覆盖新状态。本次无需数据库迁移，前后端一并更新并重启 API 即可。

## 发信依赖

Node.js 后端可通过 Nodemailer 连接 SMTP；也可封装邮件服务商的 HTTP API，避免业务代码依赖具体服务商。注册邮件模板包含站名、用途、有效期和验证码，不能包含用户密码。

需要准备一个允许应用发信的 SMTP 账号或事务邮件服务。服务端环境配置包括 SMTP_HOST、SMTP_PORT、SMTP_SECURE、SMTP_USER、SMTP_PASSWORD、MAIL_FROM，以及独立的验证码 HMAC 密钥。SMTP_PASSWORD 应按服务商要求使用应用授权码或专用凭证；配置不得进入前端公共环境变量或代码仓库。

开发阶段可使用本地邮件捕获服务或测试邮件服务完成流程验证；正式上线再配置真实发信账号。开发用验证码查看功能不得出现在生产 API 中。

自有域名发信时，根据邮件服务商要求配置发信域名验证、SPF、DKIM 和 DMARC；目前尚未选定服务商，也没有修改任何 DNS 或发信账号。

## 验收要点

- 验证成功前不能创建有效账号，客户端不能指定角色。
- 错码、过期码、已使用码、其他邮箱或其他用途的码均失败。
- 并发提交同一验证码只能成功一次；同一邮箱只能创建一个账号。
- 发信失败可重试且反馈准确，重复点击不能绕过发送限制。
- 日志不包含密码、验证码、会话凭证或完整重置链接。
- 重启后会话及限制行为符合约定，用户信息和论坛数据不会因进程重启丢失。

参考：

- https://nodemailer.com/smtp
- https://cheatsheetseries.owasp.org/cheatsheets/Email_Validation_and_Verification_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
