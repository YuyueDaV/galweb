# 澄之响视觉小说同好会论坛

南京工程学院澄之响视觉小说同好会论坛。采用 Nuxt、Vue 3、TypeScript、NestJS 和 MySQL，以暖纸色和橙色作为视觉主题，延续原「十二橙器」评选项目。

## 启动

要求 Node.js 24.16 或兼容版本、pnpm 11.25。

先配置 `apps/api/.env` 中的数据库连接。Windows PowerShell 使用 `pnpm.cmd`，可避免 `pnpm.ps1` 被执行策略拦截。

```powershell
pnpm.cmd install
pnpm.cmd db:migrate
pnpm.cmd dev:api
```

保持后端终端运行，在另一个终端启动网页：

```powershell
pnpm.cmd dev
```

预览地址：<http://127.0.0.1:3100>。

```powershell
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
```

## 已完成

- Bangumi 开放游戏搜索、管理员导入与编辑作品书库、共同投票人数统计与用户个人 Tier 榜，支持 Bangumi 来源、草稿及发布管理，详见 [书库与 Tier 使用说明](docs/catalog-and-tiers.md)。

- 社区首页：搜索、分区筛选、精选与待回复筛选、排序、加载更多。
- 列表由后端统一搜索、筛选、排序和分页；支持自上传图片缩略图，正文最多 10000 字符，失败时显示具体原因。
- 作品书架：十二部作品、名称与制作组搜索、排序、作品详情及关联讨论。
- 十二橙器榜单：保留原项目的排名、提名人和作品封面。
- 十二橙器活动 `/awards`：第二届起的提名、待审核反馈、候选名单、投票与公布结果，初始时间待公布。
- 活动管理 `/admin/awards`：管理员配置名额和日期、审核及推进阶段；管理员可创建届次及归档，只有超级管理员可以分配角色。配置、审核、选票与固定结果保存到 MySQL，写操作由后端鉴权。
- 帖子详情：剧透遮挡、点赞、收藏、回复。
- 邮箱验证码注册、密码登录、找回密码、退出登录；发帖、回复、收藏、点赞与刷新后的登录恢复。
- 管理中心 `/admin`：帖子、回复与图片管理；作者可编辑或软删除本人帖子。账号管理独立于活动管理，仅超级管理员可从侧栏“账号权限”进入 `/admin/accounts` 查看账号、管理启停状态及分配角色。
- JPG/PNG/WebP 上传并重编码、数据库与图片备份、恢复演练、Docker 与 nginx 部署示例。
- 深浅主题和移动端导航；主题保存在本机，正式账号与社区数据由服务器保存。
- 用户中心 `/account`：修改昵称、上传或恢复默认头像、设置个性签名；头像同步展示在导航、帖子和回复中。
- 用户自主注销：校验当前密码并输入确认文字，撤销所有会话，释放邮箱与用户名；讨论匿名保留，图片清理，历史榜单保留票数和名次，保护最后一名超级管理员。
- 字体随项目本地提供，不依赖 Google Fonts 在线加载；许可文件位于 `apps/web/public/fonts/`。
- Markdown 发帖：工具栏、预览、最多 12 张配图、整篇及局部剧透折叠、按账号自动保存与恢复草稿。
- 公开用户主页 `/user/:id`、针对留言的回复、站内通知 `/notifications`、默认私密的阅读书单 `/library`。
- 站点配置 `/admin/site`、社团动态与相册管理 `/admin/community`，公开时间线与相册位于 `/community`。
- 帖子服务端加载、目录、字号与宽屏阅读偏好、阅读进度及图片放大；支持 sitemap 与 robots。

## 范围

前端已接入真实账号、论坛与评选接口。初次部署会导入既有作品和社区介绍内容，历史档案保留原提名信息；旧前端 localStorage 的体验账号和选票不会导入为正式数据。真实 SMTP 需要服务商配置，未配置时仅在开发模式捕获测试邮件。公网部署和 Docker 构建仍需在目标服务器验证。

原排行榜数据来自用户提供的 `D:/works/gala/十二橙器排行榜.html`，封面来自 `D:/works/gala/十二橙器/uploads/`，原文件未修改。可运行 `powershell -File scripts/prepare-covers.ps1` 重新整理封面。游戏封面权利归各自权利人所有，正式发布前请确认素材使用范围。

桌面界面默认采用原版 125% 的视觉尺寸，浏览器设置为 100% 即可。尺寸使用 rem 随统一字号缩放，窄屏恢复常规比例；大标题与榜单全部作品名称统一使用思源宋体风格，界面和辅助信息使用本地思源黑体及 DM Sans。

首页大图、书架、帖子缩略图与侧栏封面使用 `WorkCover` 组件，根据显示尺寸与屏幕像素密度选择图片。运行 `node scripts/prepare-cover-variants.mjs` 可从仓库中的 `public/images/works/source` 图片生成 WebP 变体与尺寸清单，无需依赖旧 uploads 目录。封面保留完整比例，横幅单独裁剪，不放大源图；图片路径含内容摘要以避免旧缓存。来源和实际尺寸见 [作品图片来源](docs/cover-sources.md)。它不依赖网站运行时图片处理服务。

导航、卡片、弹窗与次按钮统一采用 Liquid Glass 视觉层，使用本地插画、半透明底色、边缘高光与按需 SVG 折射，支持浅色／深色模式和手机端磨砂降级。正文与表单保持清晰底色，减少透明度时使用实色底。外观参数、应用范围及参考组件适配差异见 [Liquid Glass 说明](docs/liquid-glass.md)。

同好会 QQ 群宣传接入首页、关于页和页脚，支持二维码放大、保存原图及复制群号；Logo、二维码和群号集中配置，更新方法见 [同好会宣传入口](docs/club-promotion.md)。

字体使用本地托管的 Noto Sans SC、Noto Serif SC 和 DM Sans 可变 WOFF2，保留官方 Unicode 分段，浏览器仅加载页面用到的字形分段。维护时运行 `node scripts/vendor-fonts.mjs`，来源、字重、文件摘要及范围见 `apps/web/public/fonts/manifest.json`，许可证见相邻 OFL 文件；正常构建和访问页面都不请求外部字体服务。不要按某一版页面文案裁剪中文字符，否则新增文案和用户内容会触发系统字体回退，造成局部字重不一致。

## 目录

```text
apps/web/
  app/
    assets/css/       # 响应式样式和主题
    components/       # 导航相关组件、帖子卡片、对话框等
    composables/      # 前端状态、认证与 API 调用
    data/             # 示例帖子与原评选作品数据
    pages/            # 社区、书架、榜单、详情与社团介绍
    types/            # TypeScript 数据类型
  public/images/works/ # 从原项目整理的作品封面
```

完整运行、首名管理员、备份恢复与部署说明见 [运行与部署](docs/deployment.md)。账号接口详情见 [账号后端运行说明](docs/auth-setup.md)。

EdgeOne Pages / Makers 前端上线分支的构建配置、服务器接口网关和环境变量见 [EdgeOne 部署说明](docs/edgeone-deployment.md)。部署检查命令为 `pnpm build:edgeone`、`pnpm test:edgeone`，需先配置文档中的部署变量。

新增编辑器、通知、主页、书单、站点配置与活动相册的入口、数据表及部署配置见 [社区内容体验](docs/community-experience.md)。

十二橙器的角色边界、阶段规则、MySQL 实体和接口约定见 [后端接入说明](docs/awards-backend.md)。

正式账号后端支持邮箱验证码注册、用户名密码登录、会话退出和邮箱重置密码；流程与数据模型见 [邮箱注册方案](docs/email-registration.md)。SMTP 凭证需要由部署者配置，不要求安装 Redis。普通测试会跳过需专用数据库的集成用例，完整验证方式见运行说明。

开发验证、独立业务规则、视觉规范及 Tailwind 使用方法见 [工程检查与样式规范](docs/quality-and-styling.md)。完整检查命令：`pnpm check`。
