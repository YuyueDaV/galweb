# EdgeOne Pages / Makers 部署

使用宝塔管理服务器时，可按 [宝塔后端部署步骤](baota-deployment.md) 配置数据库、Node 进程、HTTPS 和接口网关。

此分支采用「EdgeOne Nuxt SSR 前端 + 独立 NestJS 后端 + MySQL」方案，保留现有业务、登录会话与数据库。只运行构建不会发布网站、创建云项目、发送邮件或修改数据库。Pages 已升级为 Makers，以下统一称 EdgeOne。

## 分支与部署范围

`codex/edgeone-deployment` 从 `codex/warm-glass-ui` 当前提交创建。创建时工作区已有的字体修复被保留。本分支增加前端部署产物，不会把 NestJS、数据库或本机上传目录变成云函数。

```text
浏览器 → https://forum.example.com（EdgeOne Nuxt SSR）
             └─ /api/* → https://api.example.com/api/*（服务器 nginx）
                                └─ 127.0.0.1:3200（NestJS）
                                      ├─ MySQL
                                      ├─ 持久化图片目录
                                      └─ QQ SMTP
```

完整论坛需要已部署、EdgeOne 能访问的 HTTPS 后端。本机 `127.0.0.1:3200` 和本机 MySQL 不可直接用于正式上线。头像和帖子图片继续由后端保存在持久目录，部署、更新或重启后必须保留该目录。

## EdgeOne 控制台

通过 Git 导入已有仓库；首次验证可将本分支作为独立测试项目的部署分支，避免直接替换正式网站。仓库可以保持私有。设置如下：

| 设置          | 值                                                                    |
| ------------- | --------------------------------------------------------------------- |
| 项目根目录    | `./`，仓库根目录                                                      |
| 框架预设      | Other / 自定义构建                                                    |
| Node 构建版本 | `24.18.0`                                                             |
| 安装命令      | `npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile` |
| 构建命令      | `pnpm build:edgeone`                                                  |
| 输出目录      | `apps/web/.edgeone`，相对于仓库根目录                                 |

仓库根目录的 `edgeone.json` 已写入上述配置。已有 EdgeOne 项目需要在控制台将根目录从 `apps/web` 改为 `./`；旧的应用目录配置文件已移除。仓库根目录是 workspace 项目，由自定义脚本进入前端目录构建并生成 SSR 函数，避免平台在前端应用目录再次加载 Nuxt 适配器。不要改成 `nuxt generate`，不要只上传 `.edgeone/assets`，也不要添加全部路由重写到 `index.html` 的 SPA 规则。

若日志出现 `.edgeone-nitro-config.mjs` 和 `Cannot find module '@nuxt/kit'`，表示平台自动注入的模块无法从应用目录解析依赖，末尾 `No server-handler detected` 是构建中断后的结果。前端现已显式固定 `@nuxt/kit@4.6.3`，与 Nuxt 版本一致；仍需按上表使用仓库根目录入口，避免自动适配覆盖本项目处理 Cookie、二进制上传和可信 IP 的函数入口。更新代码、修改项目根目录后，使用最新提交重新部署，必要时清除构建缓存。

当前锁文件使用 pnpm 11.25；安装包含开发依赖，构建需要 Nuxt、Tailwind 和适配器。不要设置 `--prod` 安装。Node 24.18 是官方构建指南当前列出的预装版本；平台配置若调整，以控制台实际可用版本为准。

在该项目的生产环境添加以下变量。示例见 `deploy/edgeone/.env.example`，不要将本机 `apps/api/.env` 整份导入 EdgeOne。

| 变量                    | 示例                                              | 可见范围                    |
| ----------------------- | ------------------------------------------------- | --------------------------- |
| `NUXT_API_BASE`         | `https://api.example.com`，不带 `/api` 和尾部斜杠 | 服务端                      |
| `NUXT_PUBLIC_SITE_URL`  | `https://forum.example.com`，不带尾部斜杠         | 公开网站地址                |
| `NUXT_API_PROXY_SECRET` | 新生成的随机字符串，至少 32 字符                  | 服务端，须与后端 nginx 相同 |

部署变量需对构建与函数运行生效，更新后重新部署。网关密钥不以 `NUXT_PUBLIC_` 开头，不写进网页、不提交仓库。可在受控终端使用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成，然后仅填入控制台和服务器配置。

构建入口只编译前端和校验共享规则；要求配置公共 HTTPS 地址和网关密钥，防止误用本机地址。产物为 `apps/web/.edgeone`：`assets/` 保存图片、字体及 JS/CSS，`cloud-functions/ssr-node/` 保存 SSR、Nuxt `/api` 转发和路由元数据。开发目录 `.nuxt`、常规 `.output`、检查目录 `.output-check` 均保持独立。

## 后端服务器

沿用 [运行与部署](deployment.md) 配置数据库、SMTP、迁移、备份及首名管理员。此方案直接在宿主机运行后端，nginx 是本机唯一入口：

```dotenv
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3200
WEB_ORIGIN=https://forum.example.com
TRUST_PROXY=loopback
MAIL_TRANSPORT=smtp
```

数据库凭证、独立的 `AUTH_SECRET`、QQ SMTP 授权码只放服务器。保持 MySQL 私网或本机访问，NestJS 的 3200 端口不对公网开放。图片目录使用专门的持久磁盘路径（`UPLOAD_DIR`），并按已有备份方案同步保存数据库和图片。Docker 的代理信任范围和数据库访问方式不同，不要直接照搬这里的回环配置。

使用 `deploy/edgeone/nginx-api.conf.example` 配置 `api.example.com` 的 HTTPS：

1. 替换域名、证书路径，以及网关密钥占位符。密钥与 `NUXT_API_PROXY_SECRET` 一致，真实 nginx 配置保存在服务器，不提交 Git。
2. nginx 在转发前验证 `X-Czx-Proxy-Secret`，防止外部请求直接绕过前端并伪造 IP。请求通过校验后转发到本机 NestJS。
3. Nuxt 覆盖客户端传入的转发 IP，使用 EdgeOne 函数的 `context.clientIp`。nginx 保留这一已验证来源的 IP，后端仅信任回环代理。不要改成追加网关出口 IP，也不要设置全局 `TRUST_PROXY=true`。
4. `WEB_ORIGIN` 必须与用户实际访问的前端协议、域名、端口一致。预览环境使用单独的测试后端、数据库及固定测试域名，不要为了兼容随机预览域名放开来源验证。

浏览器仍访问同域 `/api`，生产 `Secure` / `HttpOnly` Cookie、CSRF 头和邮箱注册流程沿用现有实现。SSR 与 API 响应均禁止公共缓存，只让静态图片、字体与编译资源走 CDN 缓存；不要额外配置「所有内容缓存」覆盖该策略。

## 构建与验证

本机先在当前终端设置上述三个变量，再执行：

```powershell
pnpm build:edgeone
pnpm test:edgeone
```

测试从根目录 `edgeone.json` 读取实际输出路径，验证前端可解析 Nuxt Kit，再在本机随机端口建立临时模拟接口并直接调用构建后的 SSR 函数，检查 Cookie、二进制上传、CSRF、可信 IP、错误状态、HEAD / 204、站点地图、静态资源结构以及私有文件排除。不会连接本机正式 MySQL，也不会发送邮件。测试只证明产物在 Node 下的转发与渲染行为；EdgeOne 的真实路由、环境变量、请求体限制、网络和域名证书还需在测试项目验证。

完整原有回归检查仍为 `pnpm check`。EdgeOne 检查单独执行，因为它需要部署环境变量，并构建独立的函数产物。

GitHub 的 Quality 工作流在原有检查后额外构建并测试 EdgeOne 产物，使用示例域名和仅供验证的虚拟密钥，不连接或发布线上环境。正式发布仍由 EdgeOne 连接仓库后执行。

适配器固定为 `@edgeone/nuxt-pages@1.1.2`。原始处理器将上传内容转成文本，本分支替换为保留 Buffer 的处理器，避免损坏图片；同时保留多条 Set-Cookie、禁止动态响应共享缓存、剔除客户端伪造的代理头。构建不会让适配器临时修改 `nuxt.config.ts`，并从产物中排除 dotenv 文件。

上线测试项目后逐项验收：

- 首页、书架、帖子详情、账户页直接刷新可打开，字体和封面可加载。
- `/api/health` 正常；邮箱验证码注册、错误提示、登录后刷新、退出均正常。
- 发帖、回复、收藏及上传头像 / 配图有效；管理和投票权限符合预期。
- 服务器重启后数据库和上传图片仍在；外部不带网关密钥直接请求 API 返回 403。
- 两个测试来源分别操作时，后端限流按可信 IP 区分；Cookie 不被其他账号或游客复用。
- 改回上一个前端部署时功能可恢复。数据库迁移和数据备份单独管理，前端回滚不等于数据库回滚。

## 域名与区域

未备案时可先评估「全球可用区（不含中国大陆）」并绑定自定义域名；使用中国大陆或包含大陆的加速区域需满足对应备案要求。个人主体是否能备案当前论坛业务，应向备案服务商说明真实的注册、发帖和投票功能后确认。

默认项目域名 / 部署域名在中国大陆可能需要有效期 3 小时的预览链接，不能当作长期访问地址。函数地域、配额、请求体限制和实际延迟以当前控制台和实测为准，不承诺上线后永久免费或大陆访问速度。

官方依据（2026-11-07 核对）：

- [Nuxt 框架与 SSR 支持](https://pages.edgeone.ai/zh/document/framework-nuxt)
- [构建设置、根目录、Node 与环境变量](https://pages.edgeone.ai/zh/document/build-guide)
- [edgeone.json 配置](https://pages.edgeone.ai/zh/document/edgeone-json)
- [Node Functions 与 clientIp](https://pages.edgeone.ai/zh/document/node-functions)
- [域名与加速区域](https://pages.edgeone.ai/zh/document/domain-overview)
- [Pages 与 Makers 的关系](https://pages.edgeone.ai/zh/document/faqs)
