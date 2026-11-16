# QQ、Discord 登录与账号绑定

网站支持 QQ 和 Discord 的 OAuth2 授权登录。原来的邮箱验证码注册、用户名／邮箱密码登录和密码找回继续可用。

## 账号规则

- 首次使用未绑定的第三方身份登录，会自动创建普通成员账号，使用授权昵称和网站默认头像；用户名自动生成。不会虚构邮箱或密码，也不会按昵称自动合并已有账号。
- 已有账号应先登录网站，再在「用户中心 → 登录方式与账号绑定」绑定 QQ 或 Discord。绑定后都进入同一个网站账号，保留书单、收藏、提名及权限。
- 每个网站账号最多绑定一个 QQ 和一个 Discord；同一第三方身份只能绑定一个网站账号。冲突时提示先到原账号解绑，不直接转移身份或合并数据。
- 可以解绑，但必须保留密码登录、已验证邮箱恢复或另一种第三方登录中的至少一种。只有第三方登录的新账号可在用户中心验证邮箱并设置密码，之后也能使用邮箱或自动生成的用户名登录和找回密码；注销账号不要求先补充邮箱和密码，输入“注销账号”确认即可。
- 停用账号无法通过第三方登录；注销时删除关联身份和未完成的绑定授权。之后再授权会建立新账号，不继承原数据或权限。

## 平台与环境配置

在 [QQ 互联](https://connect.qq.com/) 为网站申请应用，在 [Discord Developer Portal](https://discord.com/developers/applications) 创建应用并取得 OAuth2 Client ID 和 Client Secret。应用资格、审核和测试用户限制以各平台控制台为准；网站代码不能代替平台审核。Discord 只请求 `identify`，QQ 请求 `get_user_info`。

密钥只写入服务器 `apps/api/.env`，或后端运行环境的同名变量；不要放进前端、EdgeOne 公共变量、Git 或发给其他人。

```dotenv
WEB_ORIGIN=https://njitgal.cn
QQ_CLIENT_ID=你的QQ应用AppID
QQ_CLIENT_SECRET=你的QQ应用AppKey
DISCORD_CLIENT_ID=你的Discord应用ClientID
DISCORD_CLIENT_SECRET=你的Discord应用ClientSecret
```

可以只开放其中一种：另一组 ID 和 Secret 都留空。单独缺少 ID 或 Secret 会阻止 API 启动，避免错误配置对外开放。全部留空时登录窗口不显示第三方按钮；用户中心显示「暂未开放」。这些值属于你自己的应用，不应使用参考仓库的密钥。

在各平台登记以下完整回调地址（如果主站不是 `njitgal.cn`，改成实际 `WEB_ORIGIN`）：

| 平台    | 回调地址                                             |
| ------- | ---------------------------------------------------- |
| QQ      | `https://njitgal.cn/api/auth/oauth/qq/callback`      |
| Discord | `https://njitgal.cn/api/auth/oauth/discord/callback` |

回调经过**主站**的 `/api` 代理，不填写 `api.njitgal.cn`。协议、域名、路径与代码生成的地址必须一致；`WEB_ORIGIN` 不带末尾 `/`。保留现有主站 API 代理、网关凭据和 HTTPS 配置。QQ 控制台若要求域名级回调规则，还需按其规则登记对应主站域名。

本地测试需要在平台允许的测试应用中登记相应地址，例如 `http://127.0.0.1:3100/api/auth/oauth/discord/callback`。若平台不允许本地地址，使用你控制的 HTTPS 测试域名并相应修改测试环境 `WEB_ORIGIN`，不要把生产密钥放进前端。

## 更新部署

这次更新需要同时更新 API 和前端，并执行数据库迁移。迁移新增 `oauth_identities`、`oauth_flows`，将用户邮箱列改成允许空值；保留已有账号、密码、邮箱唯一约束和所有社区数据，可重复执行。

宝塔服务器在核对工作区干净、分支为 `codex/edgeone-deployment` 后执行（路径按实际部署调整）：

```bash
cd /www/wwwroot/galweb
git status --short
git branch --show-current
git pull --ff-only origin codex/edgeone-deployment
pnpm install --frozen-lockfile
pnpm --filter @chengzhixiang/api build
pnpm db:migrate
```

然后在宝塔「网站 → Node 项目」重启现有 `galweb-api`，运行目录为 `apps/api`、命令为 `node dist/main.js`，使新的配置生效。EdgeOne 重新部署同版本前端。完整基础环境与备份见 [宝塔部署说明](baota-deployment.md)。

可检查 `https://njitgal.cn/api/auth/oauth/providers`，返回内容只有平台名称与开放状态，不包含密钥。随后实际测试首次登录、用户中心绑定、退出后再次登录，以及解绑提示。

## 实现与验证

后端入口位于 `apps/api/src/oauth-api.ts`，账号关联位于 `oauth.ts`，平台授权与换令牌位于 `oauth-providers.ts`。前端入口为 `SocialLoginButtons.vue`、`SocialAccountSettings.vue` 和统一的 `OAuthResultNotice.vue`。

服务端交换授权码并查询用户身份，不把 access token 发给浏览器或长期保存。授权状态绑定 HttpOnly、SameSite=Lax 浏览器 Cookie，十分钟过期且只使用一次；绑定回调还要求原网站会话未变，绑定及解绑请求校验 CSRF。Discord 使用 S256 PKCE。回调仅允许返回本站普通页面，代理保留 303 跳转和全部 Set-Cookie。绑定、解绑和登录写入管理审计记录，身份冲突与建号在事务中处理。

自动化测试使用隔离 MySQL 和模拟平台响应，覆盖建号、重复登录、冲突、会话失效、CSRF、重放、取消授权、邮箱密码补充、最后一种登录方式保护及手机界面；不调用真实平台。正式应用的审核状态、回调白名单和真实密钥仍需在配置完成后做实际授权验收。

平台协议参考：[QQ 授权码换令牌](https://wiki.connect.qq.com/使用authorization_code获取access_token/)、[Discord OAuth2 文档](https://docs.discord.com/developers/topics/oauth2)。
