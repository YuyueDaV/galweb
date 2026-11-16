# 项目维护说明

## 历史数据与运行范围

前端已接入真实账号、论坛与评选接口。初次迁移会导入既有作品和社区介绍，历史档案保留原提名信息；旧前端 localStorage 的体验账号和选票不会导入为正式数据。正式账号、帖子、作品、书单、评选和通知由后端与 MySQL 保存。

真实 SMTP 需要服务商配置。未配置真实邮件时，开发模式可捕获测试邮件；生产模式要求 SMTP 和 HTTPS。QQ、Discord 使用部署者自己的应用 ID、密钥与回调地址，配置前不显示登录入口。公网环境和 Docker 部署仍需在实际目标服务器验证。

原排行榜数据来自维护者提供的 `D:/works/gala/十二橙器排行榜.html`，封面来自 `D:/works/gala/十二橙器/uploads/`，原文件未修改。保留原素材时可运行 `powershell -File scripts/prepare-covers.ps1` 重新整理封面；普通部署不依赖这两个维护者本地目录。

## 字体与尺寸

桌面界面默认采用原版 125% 的视觉尺寸，浏览器设置为 100% 即可。尺寸使用 rem 随统一字号缩放，窄屏恢复常规比例；大标题与作品名称使用本地宋体风格，其余界面使用本地黑体与 DM Sans。

Noto Sans SC、Noto Serif SC 和 DM Sans 以可变 WOFF2 本地托管，保留官方 Unicode 分段，浏览器仅加载页面用到的字形。不依赖 Google Fonts 在线请求。维护时运行 `node scripts/vendor-fonts.mjs`；来源、字重、摘要与范围见 `apps/web/public/fonts/manifest.json`，许可见相邻 OFL 文件。

不要按某一版页面文案裁剪中文字符，否则新增文案和用户内容会触发系统字体回退，造成局部字重不一致。

## 图片与主题

首页大图、书架、帖子缩略图与侧栏封面使用 `WorkCover`，根据显示尺寸和屏幕像素密度选择图片。`node scripts/prepare-cover-variants.mjs` 可从仓库中的 `apps/web/public/images/works/source` 生成 WebP 变体与尺寸清单，无需依赖旧 uploads 目录。封面保留完整比例，横幅单独裁剪，不放大源图；路径含内容摘要以区分缓存。来源及尺寸见 [作品图片来源](cover-sources.md)。

导航、卡片、弹窗与次按钮统一采用 Liquid Glass 视觉层，支持浅色／深色模式、手机端磨砂降级和减少透明度时的实色底。背景图、纯色预设与默认插画见 [网站背景设置](site-background.md)，参数和组件适配见 [Liquid Glass 说明](liquid-glass.md)。

同好会 Logo、二维码和 QQ 群号集中在 `apps/web/app/data/club.ts`，入口位于首页、关于页和页脚，见 [同好会宣传入口](club-promotion.md)。

游戏封面、插画、字体和同好会宣传素材的权利及许可归各自权利人所有。公开仓库和源码包不提供对第三方素材的额外授权。
