# 检查、业务规则与界面规范

## 一条命令检查

使用 `.node-version` 中的 Node 24.16.0 和 `package.json` 固定的 pnpm。首次运行 `pnpm install`。

```sh
pnpm check
```

依次执行规则同步检查、ESLint、Prettier、前后端类型检查、现有测试、生产构建，以及真实浏览器流程。任何一步失败都会停止。验证构建输出为 `apps/web/.nuxt-check` 和 `.output-check`，与 3100 端口的日常开发服务分开。

Windows 默认使用已安装的 Microsoft Edge（Chromium 内核）。其他平台先运行 `pnpm exec playwright install chromium`；Linux 可能需要 `pnpm exec playwright install --with-deps chromium`。可通过 `CZX_BROWSER_CHANNEL` 指定其他已安装的浏览器通道。

ESLint 覆盖现有前后端、脚本和测试；Prettier 门禁先覆盖新增领域模块、工程配置、浏览器测试与新组件，避免一次性重排所有历史文件。迁移旧文件时再纳入格式检查。可分别运行 `pnpm lint`、`pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm build:check`、`pnpm test:e2e`。

## 隔离测试环境

`test:e2e` 不读取项目的 MySQL 或 SMTP 密码。Windows 默认从 `C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe` 启动独立服务；其他安装位置可设置 `CZX_MYSQL_BIN`。

- MySQL：127.0.0.1:33317，目录 `.data/e2e/mysql`。
- 测试 API：127.0.0.1:3217；生产前端预览：127.0.0.1:3117。
- 每轮创建随机名称且以 `_test` 结尾的独立数据库；正常完成后清理该库并关闭隔离 MySQL。
- 邮件使用 capture，保存在本轮 `.data/e2e/run-*/.data/mail`，不向外发信。
- 浏览器运行前，在同一个隔离 MySQL 中启用 `AUTH_INTEGRATION=1` 执行全部后端测试。
- 浏览器通过真实页面执行注册、失败登录提示、登录、Markdown 发帖、回复、收藏、头像上传、提名和投票；管理员审核与推进阶段通过真实受保护 API 完成。
- 另测 320／390／1024／1440 宽度、移动菜单、搜索、主题持久化、图片故障和减少动画。

GitHub Actions 的 `quality.yml` 使用任务专属的 MySQL 服务，未使用个人数据库及邮箱配置。工作流已写入仓库，推送后才会在 GitHub 上执行。浏览器失败截图与 trace 位于 `test-results`，报告位于 `playwright-report`。

## 业务规则

`packages/domain` 是活动类型、角色判断、权限、名额校验、活动阶段和计票规则的唯一源头，无 Vue、NestJS 或数据库依赖。日期输入和展示格式放在前端 `utils/award-time.ts`。

修改共享规则后执行 `pnpm rules:sync`。API 内的生成副本用于独立部署，前端入口直接导出共享规则；`pnpm rules:check` 防止生成副本漂移。客户端权限控制决定界面显示，API 仍负责真实授权、事务和并发配额检查。

## 视觉与降级

`tokens.css` 管理配色、字体、毛玻璃参数、圆角和动画时间。`warm-glass.css` 负责导航效果，`foundations.css` 负责共享降级与书架效果。

批量液态玻璃由 `liquid-glass.css`、Vue `LiquidGlass` 组件及客户端增强器统一维护。折射与磨砂的应用范围、性能上限和参考组件的适配差异见 [Liquid Glass 说明](liquid-glass.md)。

`SafeImage` 支持原图回退，仍不可用时显示文字提示，也处理 SSR 图片在客户端接管前已失败的情况。相册大图在打开时创建。立体书架点击后按需加载，仅使用 CSS 透视与过渡；手机端和减少动画偏好下保留普通书架操作。默认显示卡片列表。

## Tailwind

采用官方 `@tailwindcss/vite` 插件与 Tailwind v4。入口 `tailwind.css` 只导入主题和工具类，不导入 Preflight，避免重置现有标题、表单、边框和字体。

工具类使用 `tw:` 前缀，例如 `tw:flex tw:items-center tw:text-czx-orange`；深色变体跟随 `html[data-theme="dark"]`。`@theme inline` 复用 `tokens.css` 的变量。新增书架组件先采用工具类，复杂透视效果继续用专用 CSS。
