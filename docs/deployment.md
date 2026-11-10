# 运行、备份与上线

EdgeOne Pages / Makers 托管 Nuxt、独立服务器托管 API 与 MySQL 的方案见 [EdgeOne 部署说明](edgeone-deployment.md)。本页原有 Docker 示例适用于前后端一起放在服务器的方案。

四个阶段的实现入口：账号与权限 `auth.ts / platform.ts`，论坛 `forum.ts`，评选 `awards.ts`，上传 `assets.ts`，API 路由 `main.ts / business-api.ts`。网页通过 Nuxt `/api` 代理调用后端，身份、帖子、回复、互动和评选数据不再使用体验 localStorage。

## 本机

1. 在 MySQL 管理工具中创建专用库和账号，为该库授权。`apps/api/.env` 配置 DB_*；不要提供 root 给应用。
2. `pnpm db:migrate` 幂等建表并导入既有十二部作品、首届静态书单相关帖子及第二届筹备草稿，不会覆盖已有用户或评选。
3. 两个终端分别执行 `pnpm dev:api` 和 `pnpm dev`。网页默认 3100，后端 3200；WEB_ORIGIN 必须与访问网页的协议、主机、端口完全一致。
4. 所有环境均不预置账号、密码或密码哈希，迁移不会创建管理员。先通过邮箱验证注册自己的真实账号，再在受控的服务器终端执行 `pnpm --filter @chengzhixiang/api admin:bootstrap 已注册邮箱`，授予首名超级管理员权限；该命令不提供 HTTP 接口，有有效超级管理员时拒绝再次引导。后续由权限界面分配角色。

升级现有数据库不会自动删除历史账号。若曾启用旧版本的本地开发管理员，请先将权限交接给经过邮箱验证的个人账号，再在管理界面禁用旧账号（会同时撤销其会话）。发布新版本时重新构建并清除旧构建目录，避免复用已移除的脚本。

开发的 MAIL_TRANSPORT=capture 将邮件保存在 `apps/api/.data/mail/`。真实 SMTP 需配置服务商账号，验证码不会通过公共接口返回。邮箱注册不代表社团成员资格，当前投票资格为已注册、未禁用的账号。

本机的 `UPLOAD_DIR` 必须指向已有上传文件所在目录。默认从 API 工作目录解析 `.data/uploads`；Windows 可显式设置如 `D:/works/galweb/apps/api/.data/uploads`。不要沿用 Linux 服务器的 `/www/server-data/galweb/uploads`，否则数据库图片记录存在但文件请求会返回 404。修改 `.env` 后重启 API；数据库和图片目录应配套恢复。

## 数据和权限

- MySQL 保存正式账号、作品、帖子、回复、点赞、收藏、届次、提名、选票、固定结果、文件元信息、审计日志。
- `.data/uploads` 保存重编码后的 WebP；输入只接受有效 JPG/PNG/WebP，最大 5MB、4000 万输入像素，输出边长不超过 2400。SVG、动画及其他格式不作为可执行资源提供。
- 普通成员编辑或删除本人帖子；管理员管理帖子显示状态、置顶精选和回复；管理员也可创建及归档活动；账号查询、启停及角色分配仅限超级管理员。至少保留一名有效超级管理员。变更账号权限会撤销其会话。
- 发帖和编辑正文最多 10000 字符，JSON 请求体上限 128 KiB。超大请求返回 413，错误 JSON 返回 400，字数校验失败返回 422，均包含中文错误说明。上传图片维持 5 MB 的独立上限。
- 论坛列表的搜索（标题、摘要、作者、标签）、分类、精选、未回复、收藏和排序由后端先处理，再分页。前端每页加载 6 篇，展示后端总数，列表与详情缓存分开，加载失败可重试。用户自上传配图会显示在首页卡片中。
- 用户中心 `/account` 保存昵称、最多 120 字的个性签名与头像引用。`users.signature` 和 `users.avatar_asset_id` 由幂等迁移添加，既有用户默认空签名与文字头像。头像原图支持 JPG/PNG/WebP，最大 32 MB、4000 万像素；浏览器自动居中裁切为最长 512 像素的方形 WebP 后上传，后端仍保留 5 MB 限制。仅能关联本人上传且未隐藏的图片；上传后点击“保存资料”生效，恢复默认只解除头像引用。处理、上传与失败原因在头像旁显示，失败同时弹出通知。
- 活动按筹备、提名、投票、公布、归档推进。名额开放后锁定，时间为空时由阶段控制；配置日期后提交还需满足窗口。同票作品须持续加赛直至分出唯一位次，才能公布、归档，入选数量不因同票超额。旧届次存在同票时可重新开启加赛，历史选票和原始得分保留。
- 账号引导与角色变更、内容管理、活动操作均记录审计日志。前端隐藏按钮不是鉴权依据。
- 自主注销需要当前密码、CSRF 和确认文字，释放邮箱与用户名，同时撤销会话、匿名化公开作者并清理图片。`pnpm db:migrate` 幂等增加 `users.deleted_at` 和 `deleted` 状态；用户名迁移跳过已注销记录。保留的匿名 UUID 维持外键，不允许后台恢复；验证码及登录限流不会因注销而清空。详细数据处理见 [账号后端运行说明](auth-setup.md#自主注销)。

## 备份与恢复

设置 MYSQLDUMP_PATH 为 mysqldump 可执行文件路径（Windows 例如 MySQL 安装目录的 `bin/mysqldump.exe`），然后执行 `pnpm --filter @chengzhixiang/api backup`。BACKUP_DIR 可指定目标目录，默认 `apps/api/.data/backups`。

备份包含 `database.sql`、uploads 目录和标记 complete 的 manifest。无 complete manifest 的目录不应作为有效备份。数据库采用单事务导出，图片为不可变文件，备份期间新增的多余文件可以保留；先完成数据库导出再复制图片。凭证通过临时配置文件传入，结束时清除，不写入命令行或备份清单。自行保护备份目录权限，并同步到独立磁盘或受控对象存储；当前未配置任何云账号或自动定时任务。

恢复时先停写，创建新的恢复数据库，通过 MySQL 管理工具导入 database.sql，再将 uploads 复制到对应目录；把应用切换到恢复库后检查账号、帖子与结果，再开放访问。不要覆盖运行中的数据库。建议定期在独立测试库执行恢复演练。

## 生产部署准备

提供了 `deploy/Dockerfile`、`deploy/compose.yml` 和 nginx 配置示例。尚未向公网发布，也未申请域名或证书。Docker 构建和公网 SMTP 需在目标服务器上验证。

上线前在服务器准备专用 MySQL、SMTP、域名与 HTTPS 证书；设置 NODE_ENV=production、MAIL_TRANSPORT=smtp、WEB_ORIGIN=https://实际域名。Cookie 在生产强制 Secure / HttpOnly。生产配置请单独放在服务器，不要直接沿用个人开发密码。

compose 示例连接宿主机数据库（host.docker.internal）；宿主机 MySQL 必须允许 Docker 网络中的专用账号连接，并由防火墙限制来源，`galweb@localhost` 仅适用于本机进程部署。数据库保持私有，容器只把网页端口映射到宿主机回环地址，nginx 对外提供 HTTPS。也可不使用 Docker，分别以服务管理工具运行两个 Node 进程。

Nuxt 代理会覆盖客户端传入的 X-Forwarded-For。直接访问 Nuxt 时不信任外部代理头；经受信任的 nginx 部署且 Nuxt 端口仅允许 nginx 访问时设置 NUXT_TRUST_PROXY=true。后端 TRUST_PROXY 默认仅信任 loopback，Docker 示例允许内部网络；不要将后端端口直接暴露公网。这样限流可按实际客户端 IP 工作。

启动前执行迁移，再构建和启动服务。日常运行账号可只授予 SELECT/INSERT/UPDATE/DELETE；建表迁移用单独受控账号执行。日志不记录密码、验证码和会话凭证。

## 验证命令

`pnpm typecheck`、`pnpm test`、`pnpm build`。完整数据库与 HTTP 测试需要专用 `_test` 数据库并设置 AUTH_INTEGRATION=1；这些测试写入随机测试用户，不能指向正式数据库。规则共享代码由 `scripts/sync-award-rules.mjs` 同步，修改评选规则后重新构建。
