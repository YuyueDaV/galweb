# 在宝塔部署 NestJS 后端和 MySQL

适用当前 `codex/edgeone-deployment` 分支：Nuxt 前端放 EdgeOne，雨云等 Linux 服务器运行宝塔、Nginx、NestJS 和 MySQL。以下是操作指南，不会自动连接或更改你的服务器。

本指南按当前项目的域名规划填写：前端 `https://njitgal.cn`，后端 `https://api.njitgal.cn`，代码目录 `/www/wwwroot/galweb`。这是一份待执行流程，不代表这些地址已经上线。其他项目使用时替换域名；密码和密钥必须自行设置。没有域名时，可以先在服务器本机验证后端；完整的生产登录和 EdgeOne 接入还需要 HTTPS 地址。

## 域名分工与当前 DNS 表单

域名仍由阿里云解析，不需要把 DNS 服务器改为腾讯云。EdgeOne 绑定前端域名，宝塔绑定后端域名。用户浏览器请求前端同域 `/api`，由 EdgeOne 转发至宝塔后端。

| 用途         | 完整域名         | 在阿里云添加的记录                                | 服务端配置位置                     |
| ------------ | ---------------- | ------------------------------------------------- | ---------------------------------- |
| 网站前端     | `njitgal.cn`     | `@`，CNAME，记录值由 EdgeOne 提供                 | EdgeOne 项目「域名管理」           |
| 后端接口     | `api.njitgal.cn` | `api`，A，记录值为雨云服务器公网 IPv4             | 宝塔 API 站点                      |
| 可选前端别名 | `www.njitgal.cn` | `www`，CNAME，记录值按 EdgeOne 对该域名的提示填写 | EdgeOne 另行添加并配置跳转至主域名 |

当前阿里云「添加记录」表单可以先创建后端记录：

| 字段                    | 填写                            |
| ----------------------- | ------------------------------- |
| 记录类型                | `A`                             |
| 主机记录                | `api`，不要保留 `@`             |
| 解析请求来源 / 解析线路 | **默认**，不要仅选择「境外」    |
| 记录值                  | 雨云控制台确认的服务器公网 IPv4 |
| TTL                     | 默认值                          |
| 状态                    | 启用                            |

此前截图显示的服务器 IP 为 `162.251.94.208`，仅在雨云控制台确认仍为该地址时使用；端口、`http://`、`https://` 均不填入记录值。保存后在服务器终端检查：

```bash
getent ahostsv4 api.njitgal.cn
```

前端记录需先在 EdgeOne 的「域名管理」添加 `njitgal.cn`，按其提示在阿里云添加归属验证记录，再复制平台分配的 CNAME 目标，创建主机记录为 `@` 的 CNAME。不要猜测目标值，也不要把 `@` A 记录指向后端服务器。同一主机记录已有冲突记录时，先核对旧用途再调整。只设置 CNAME 不等于 HTTP 跳转；`www` 如需使用，还须在 EdgeOne 绑定、配置证书与到主域名的跳转。

EdgeOne 使用包含中国大陆的加速区域时，自定义域名需满足平台的备案要求；未备案阶段沿用「全球可用区（不含中国大陆）」。前端证书在 EdgeOne 配置，后端证书在宝塔配置，二者分别检查有效期与续签状态。

## 1. 安装环境

在宝塔软件商店安装 Nginx、MySQL 8.0、Node.js 版本管理器。安装 Node.js 24.x（项目本机版本为 24.16.0），将命令行版本与稍后 Node 项目的运行版本都设为 Node 24。终端安装项目使用的包管理器：

```bash
npm install --global pnpm@11.25.0
node -v
npm -v
pnpm -v
```

后续命令均在服务器的宝塔终端中执行。面板和系统管理员操作可使用 root；长期运行网站程序使用宝塔的 `www` 用户。

如果安装过 Node 后终端仍找不到 `npm`，在「网站 → Node 项目」设置「命令行版本」为已安装的 Node 24，关闭并重新打开终端再验证。不要另外用 `apt install npm` 混装 Ubuntu 的另一套 Node 环境。如果 `git --version` 提示找不到命令，先执行 `apt update` 和 `apt install -y git ca-certificates`。

## 2. 创建数据库

进入「数据库 → MySQL → 添加数据库」：

| 字段     | 填写                                   |
| -------- | -------------------------------------- |
| 数据库名 | `galweb`                               |
| 编码     | `utf8mb4`                              |
| 用户名   | `galweb`，或使用面板实际创建的专用账号 |
| 密码     | 新生成的强密码，保存到服务器配置       |
| 访问权限 | 本地服务器                             |

该账号仅授权 `galweb` 数据库，首次迁移需要 CREATE / ALTER 等建表权限。不要使用 MySQL root 账号运行网站。MySQL 保持本机访问，不需要在云防火墙开放 3306。

新建空库后由项目迁移程序创建表，不必手工逐张建表。若要保留本机开发库中的真实账号、帖子、选票和上传图片，先按 [备份恢复说明](deployment.md#备份与恢复) 迁移完整数据；建表和种子数据不等于复制本机数据库，也不会自动产生默认管理员。

## 3. 将代码放到服务器

如果目标目录还不存在，可在宝塔终端执行：

```bash
git clone --branch codex/edgeone-deployment --single-branch https://github.com/YuyueDaV/galweb.git /www/wwwroot/galweb
cd /www/wwwroot/galweb
pnpm install --frozen-lockfile
pnpm --filter @chengzhixiang/api build
```

只构建 API，不必在这台服务器运行整个前端构建。若服务器资源不足，可在本机编译 API 后上传 `apps/api/dist`，或使用 Linux CI 构建产物；生产依赖仍需在 Linux 安装。不要上传 Windows 的 `node_modules`，Sharp 等依赖需要匹配服务器平台。

若 GitHub 无法直接拉取，也可从本机上传源码压缩包，保证解压后 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 和 `apps` 都在 `/www/wwwroot/galweb` 中，再执行安装和 API 构建。

已有目录先检查内容，不要重复解压覆盖 `.env`、上传目录或数据库。数据库和上传文件需要独立备份。

## 4. 填写生产配置

在宝塔文件管理器中，将 `apps/api/.env.example` 复制为同目录的 `.env`，已有 `.env` 时保留并编辑，避免覆盖。也可在终端从仓库根目录执行下列命令，仅在文件不存在时复制：

```bash
cd /www/wwwroot/galweb
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
fi
```

编辑 `/www/wwwroot/galweb/apps/api/.env`：

```dotenv
NODE_ENV=production
API_HOST=127.0.0.1
API_PORT=3200
WEB_ORIGIN=https://njitgal.cn
TRUST_PROXY=loopback

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=galweb
DB_PASSWORD=
DB_NAME=galweb
AUTH_SECRET=

MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=

UPLOAD_DIR=/www/server-data/galweb/uploads
BACKUP_DIR=/www/server-data/galweb/backups
MYSQLDUMP_PATH=/www/server/mysql/bin/mysqldump
```

需要填写的空值：`DB_PASSWORD` 是刚创建的数据库密码；`SMTP_USER` 和 `MAIL_FROM` 填发信 QQ/Foxmail 地址；`SMTP_PASSWORD` 填邮箱 SMTP 授权码。`WEB_ORIGIN` 填用户实际访问的前端 HTTPS 地址，不能填后端域名，末尾不加 `/`。数据库用户名和端口以面板实际设置为准。

在服务器终端生成独立的认证密钥，把输出填入 `AUTH_SECRET`：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

再执行一次同样命令，另行生成接口网关密钥，稍后填到 Nginx 和 EdgeOne 的 `NUXT_API_PROXY_SECRET`。两个密钥用途不同。真实配置、邮箱授权码及带有密钥的 Nginx 配置只保留在服务器和云端控制台，不提交 Git，不发到聊天中。

准备运行用户的读写权限：

```bash
install -d -o www -g www -m 750 /www/server-data/galweb/uploads /www/server-data/galweb/backups
chown www:www /www/wwwroot/galweb/apps/api/.env
chmod 600 /www/wwwroot/galweb/apps/api/.env
```

`www` 还需要能读取项目源码、`dist` 和依赖，并能逐级访问项目目录。宝塔 Node 日志目录也应由面板配置为该用户可写。上传目录放在项目目录之外，避免更新代码时覆盖。

## 5. 验证配置与建表

在服务器终端进入仓库根目录，依次执行；前一步成功再执行下一步：

```bash
cd /www/wwwroot/galweb
pnpm --filter @chengzhixiang/api db:check
pnpm db:migrate
pnpm --filter @chengzhixiang/api mail:check
```

数据库检查成功应显示 `Database connection OK.`，迁移成功应显示 `Database schema and initial archive ready.`。`mail:check` 验证真实 SMTP 连接与认证，不发送测试邮件。

如需验证实际收信，替换下方邮箱为自己的收件地址，再执行一次：

```bash
pnpm --filter @chengzhixiang/api mail:test your-email@example.com
```

首次启动前必须先迁移，否则后端找不到业务表。生产环境要求 SMTP 配置完整和 HTTPS 的 `WEB_ORIGIN`，因此即使只执行数据库检查也要先把 `.env` 必填项填写好。

## 6. 在宝塔创建 Node 项目

进入「网站 → Node 项目 → 添加项目」，不同面板版本可能将进程管理列为 Node.js / PM2：

| 字段                      | 填写                                                |
| ------------------------- | --------------------------------------------------- |
| 项目名称                  | `galweb-api`                                        |
| 项目路径 / 运行目录 / cwd | `/www/wwwroot/galweb/apps/api`                      |
| Node 版本                 | Node.js 24.x                                        |
| 启动方式                  | `package.json` 中的 `start`，即 `node dist/main.js` |
| 如表单要求启动文件        | `/www/wwwroot/galweb/apps/api/dist/main.js`         |
| 端口                      | `3200`                                              |
| 运行用户                  | `www`                                               |
| 实例数                    | `1`                                                 |
| 开机自启 / 进程守护       | 开启                                                |

启动方式按表单选择一种即可，不要同时创建两份进程。运行目录必须是 `apps/api`，因为程序通过 dotenv 从当前工作目录读取 `.env`。不要使用 `dev` / `tsx watch` 作为线上启动方式，也不需要把整个仓库建成前端 Node 项目。

首次只启动本机进程；若表单允许，域名暂不绑定，之后单独配置 HTTPS 网关。面板自动生成的普通反向代理不能替代本项目的网关校验规则。

启动后在服务器终端验证：

```bash
curl http://127.0.0.1:3200/api/health
```

应返回 `{"status":"ok"}`。这一步不需要前端、不需要公网开放 3200，也不需要把数据库暴露到外网。启动失败查看该 Node 项目的错误日志，重点检查 `.env` 工作目录、文件权限、数据库迁移、SMTP 配置及 Node 版本。

## 7. 配置 API 域名、HTTPS 与网关

先完成上文 `api` 的 A 记录，确认解析到服务器公网 IPv4。在宝塔「网站 → PHP 项目 → 添加站点」（或当前版本对应的静态站点入口）创建站点：域名 `api.njitgal.cn`，根目录 `/www/wwwroot/galweb-api-site`，PHP 版本选择「纯静态」，FTP 和数据库不再新建。此站点仅承接 Nginx HTTPS 网关，不需要安装 PHP。不要将源代码仓库或 `apps/api` 作为可直接下载的静态站点目录。

进入该站点「设置 → SSL」，申请 Let's Encrypt 等受信任证书，勾选 `api.njitgal.cn`。解析正确、80 端口可访问时可用文件验证；也可按提示到阿里云添加 DNS 验证记录。证书安装成功后开启强制 HTTPS，并保留证书验证和续签规则。手工 DNS 验证续签可能还需人工更新 TXT，需检查面板的自动续签任务及结果。

只向公网开放网站所需 80 / 443；Node 的 3200 和 MySQL 的 3306 保持本机访问。面板和 SSH 管理端口按自己的来源 IP 限制访问。

参考仓库 `deploy/edgeone/nginx-api.conf.example`，在该 API 站点的 Nginx 配置中设置：

- `server_name` 使用实际后端域名。
- SSL 证书路径使用宝塔实际签发、配置的路径。
- 请求体上限 `client_max_body_size 6m`。
- `/api/` 转发到 `http://127.0.0.1:3200`。
- 验证 `X-Czx-Proxy-Secret`，与 EdgeOne 的 `NUXT_API_PROXY_SECRET` 相同。
- 使用示例中的可信 IP 转发规则，保持后端 `TRUST_PROXY=loopback`。
- 不启用接口响应缓存。

宝塔可能已为同一站点生成了 `location /` 或代理 include，编辑时逐项合并，避免重复规则。不要把完整示例再次嵌套到已有 `server {}` 里面，也不要覆盖证书续期所需的 ACME 验证规则。保存后使用面板的配置检查功能，确认 Nginx 配置通过后再重载。

可在面板生成的该站点 `server {}` 内合并下列配置。`client_max_body_size` 已存在时修改原值，`/api/` 已有代理时替换原规则，不要重复添加。保留宝塔生成的 `listen`、证书路径、ACME include 等其他必要配置。将占位文字替换为第 4 步另行生成的网关密钥：

```nginx
client_max_body_size 6m;

location ^~ /api/ {
    if ($http_x_czx_proxy_secret != "REPLACE_WITH_YOUR_GATEWAY_SECRET") {
        return 403;
    }
    proxy_pass http://127.0.0.1:3200;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $http_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Czx-Proxy-Secret "";
    proxy_set_header X-Czx-Client-Ip "";
    proxy_cache off;
    proxy_connect_timeout 10s;
    proxy_read_timeout 60s;
}
```

使用宝塔常见 Nginx 安装路径检查；检查成功后才重载，如实际安装路径不同需相应替换：

```bash
/www/server/nginx/sbin/nginx -t
```

```bash
/www/server/nginx/sbin/nginx -s reload
```

直接在浏览器请求公网 `https://api.njitgal.cn/api/health` 而不带网关密钥，应被网关拒绝（403）；这不代表后端故障。本机回环健康检查与经过 EdgeOne 的健康检查应为 200。

## 8. 接通 EdgeOne

在 EdgeOne 选择仓库 `YuyueDaV/galweb` 和分支 `codex/edgeone-deployment`，项目根目录为 `./`（仓库根目录），框架选择 Other / 自定义构建。根目录的 `edgeone.json` 提供安装和构建设置；已有项目需要在控制台把根目录从 `apps/web` 改为 `./`，然后使用最新提交重新部署。如果界面要求手动填写，使用以下值：

| 设置      | 值                                                                    |
| --------- | --------------------------------------------------------------------- |
| 安装命令  | `npm install --global pnpm@11.25.0 && pnpm install --frozen-lockfile` |
| 构建命令  | `pnpm build:edgeone`                                                  |
| 输出目录  | `apps/web/.edgeone`，相对于仓库根目录                                 |
| Node 版本 | 平台提供的 Node 24，当前配置 `24.18.0`                                |

在 EdgeOne 的生产目标环境填写：

```dotenv
NUXT_API_BASE=https://api.njitgal.cn
NUXT_PUBLIC_SITE_URL=https://njitgal.cn
NUXT_API_PROXY_SECRET=
```

填入与 Nginx 相同的网关密钥，重新部署。`NUXT_API_BASE` 不带 `/api` 和末尾 `/`。`NUXT_PUBLIC_SITE_URL` 与后端 `WEB_ORIGIN` 保持完全一致。前端浏览器继续请求同域 `/api`，不是让浏览器直接连接 MySQL。

从前端域名访问 `/api/health`，再验证邮件注册、登录后刷新、发帖、收藏、图片上传和投票；同时确认更换账号不会看到他人的登录状态。没有自定义域名时可以先停在第 6 步完成本机验证，再准备 HTTPS 和域名。

```bash
curl -i http://127.0.0.1:3200/api/health
curl -I https://api.njitgal.cn/api/health
curl -i https://njitgal.cn/api/health
```

三项预期依次为 `200`、`403`、`200`，成功健康检查响应正文为 `{"status":"ok"}`。SSL 不可信应修复证书，不能靠跳过验证来完成验收。

注册真实账号后，在服务器受控终端授予首名超级管理员（替换为实际注册邮箱）：

```bash
cd /www/wwwroot/galweb
pnpm --filter @chengzhixiang/api admin:bootstrap your-email@example.com
```

该命令仅用于初始化第一位超级管理员；成功后退出账号并重新登录。项目不会自动创建旧开发环境的默认管理员。

## 常见失败排查

### 迁移报 3780 / ER_FK_INCOMPATIBLE_COLUMNS

已在 MySQL 8.0.46、数据库默认 `utf8mb4_general_ci` 的环境复现旧版脚本问题：`users` 显式声明 `DEFAULT CHARSET=utf8mb4`，而 `auth_sessions` 等部分表没有声明，导致字符串外键两端继承了不同的排序规则。新版脚本为所有表声明相同的默认字符集，保留 `email_key`、`username_key` 的专用二进制排序规则，不修改已有表及用户数据。

若服务器尚未获取代码修复，可在宝塔终端应用同样的源文件修复。命令先备份原文件，仅补齐缺失的建表字符集声明，不操作 `.env`，不改变数据库默认配置，也不删除或转换已有表：

```bash
cd /www/wwwroot/galweb/apps/api
node <<'NODE'
const fs = require('node:fs');
const file = 'src/schema.ts';
const source = fs.readFileSync(file, 'utf8');
let changed = 0;
const updated = source.replace(/\) ENGINE=InnoDB(?=`)/g, () => {
  changed++;
  return ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
});
if (changed) {
  const backup = file + '.before-charset-fix.bak';
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  fs.writeFileSync(file, updated);
}
console.log('已补齐字符集声明的表数：', changed);
NODE
```

然后依次重建、重跑迁移：

```bash
cd /www/wwwroot/galweb
pnpm --filter @chengzhixiang/api build
pnpm db:migrate
```

原版脚本应补齐 9 张表；已修复时显示 0，可以重复执行。迁移保留已成功创建的表并补建其余表。如果仍报外键不兼容，检查实际关联列的 `CHARACTER_SET_NAME`、`COLLATION_NAME` 和字段类型；不要直接转换整库排序规则或关闭外键检查。已有库经其他程序修改过列定义时，需要依据实际结构单独制定迁移。

### 其他问题

| 现象                       | 优先检查                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| `npm: command not found`   | Node 版本管理器是否设定命令行版本，重开终端                           |
| `Database connection` 错误 | MySQL 是否运行、数据库名、专用账号、密码和本机端口                    |
| Node 启动失败              | 项目日志、cwd 是否为 `apps/api`、`.env` 权限、是否迁移                |
| 本机 3200 无响应           | `ss -lntp` 查看监听，宝塔 Node 项目是否启动                           |
| API 公网 403               | 无密钥访问时属预期；前端转发也 403 时核对两处网关密钥                 |
| 前端 `/api/health` 为 502  | 后端域名 DNS、HTTPS 证书、443 放行、Node 进程和反向代理               |
| 前端 `/api/health` 为 503  | 检查 EdgeOne 的网关密钥已填写且至少 32 字符，重新部署                 |
| 注册验证码失败             | SMTP 465 出站连通、邮箱授权码、服务器上的 `mail:check` 和 `mail:test` |
| 图片上传失败               | `UPLOAD_DIR` 是否存在、`www` 用户是否可写、Nginx 请求体限制           |
| 保存或登录被拒绝           | `WEB_ORIGIN` 与实际主站 HTTPS 地址一致，无末尾斜线，使用主域名访问    |

## 后续更新与备份

每次更新前备份数据库和上传目录，核对版本后再构建 API、按需迁移并在宝塔重启对应 Node 项目。不覆盖 `.env` 和持久目录。备份操作参考 [运行与部署](deployment.md#备份与恢复)，并定期复制到服务器以外的位置。

示例调用：

```bash
cd /www/wwwroot/galweb
pnpm --filter @chengzhixiang/api backup
```

这里配置的 `MYSQLDUMP_PATH` 按宝塔常见目录填写；实际位置不同应修改为真实路径。不要将完整数据备份写入公网可访问的站点目录。

官方操作参考（2026-11-07 核对）：

- [宝塔添加 MySQL 数据库](https://docs.bt.cn/user-guide/database/mysql/add/)
- [宝塔 Node.js PM2 部署](https://docs.bt.cn/practical-tutorials/nodejs-pm2-deployment/)
- [宝塔反向代理配置](https://docs.bt.cn/user-guide/site/php/site-config/reverse-proxy)
- [宝塔站点 SSL 配置](https://docs.bt.cn/user-guide/site/php/site-config/ssl/)
- [阿里云添加解析记录](https://help.aliyun.com/zh/dns/pubz-add-parsing-record)
- [EdgeOne 添加自定义域名](https://pages.edgeone.ai/zh/document/custom-domain)
