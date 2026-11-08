# Liquid Glass 视觉层

基于项目所有者提供的 Aceternity UI Liquid Glass 源码适配，继续使用 Nuxt / Vue，不引入 React 运行时。首页与其他页面使用现有本地插画，不请求参考演示中的外部背景图。

## 应用范围

- 顶部导航、导航分组、搜索、登录与图标控件。
- 首页分区卡片、侧栏卡片、书架作品卡片。
- 用户中心资料卡、个人名片、社区内容卡片和管理卡片。
- Tier 分层容器、编辑行、视图切换、次按钮。
- 登录、发帖等现有弹窗，以及手机端展开的导航。

正文阅读面板、编辑器正文、输入框、主按钮配色与账户注销警示区保留原有底色和语义。玻璃只处理元素背后的画面，不对文字、封面和子控件使用 `filter`，保持清晰度与原有点击、焦点、表单行为。

批量入口由 `apps/web/app/utils/liquid-glass-surfaces.ts` 中的 `GLASS_SURFACES` 维护；异步内容、页面路由切换和弹窗打开后自动接入。`REFRACTION_SURFACES` 控制哪些区域在桌面端启用真正的 SVG 折射，其余区域采用轻量磨砂和边缘高光。

## 与参考源码的适配差异

1. React 组件改为 `LiquidGlass.vue`，保留 `radius`、`bevelDepth`、`scale`、`aberration`、`frost`、`tint`、`contentClassName` 参数。`as` 可保留原本的 `header` 等标签，避免增加布局包裹层。参数变化会刷新贴图。
2. 保留参考中的圆角有符号距离场、Snell 折射、PNG 位移贴图和 RGB 色散 SVG 算法；按本站配色降低色散和折射强度，以保护中文导航与内容的可读性。
3. 复用本站图标、CSS 动效和主题变量；不安装 React、Motion、clsx 或 tailwind-merge。Vue 原生合并 `class` 和 `style`，统一 CSS 便于批量调整原有组件，沿用已有 Tailwind 环境。
4. 背景使用本地插画；白色/深色玻璃底色随 `data-theme` 切换，卡片和表单面板比参考海报更不透明。所有参数集中在 `liquid-glass.css`，没有加入英文演示内容。
5. 桌面 Chromium 支持时启用 URL backdrop filter；Safari、Firefox、不支持 URL 滤镜、手机、粗指针和减少动画模式使用普通磨砂。减少透明度时使用实色底，不显示背景插画。编码或解码失败也会降级，不影响操作。
6. 为批量使用增加资源管理：只处理视口及附近区域、最多同时 10 个折射贴图；每张贴图约 12 万像素以内，DPR 最高 1.5；尺寸变化防抖、串行按帧生成。离屏、元素移除、路由切换和销毁时撤销 Blob URL 并移除 SVG，不增加拖拽或持续鼠标动画。

## 新组件用法

```vue
<LiquidGlass
  as="section"
  :radius="24"
  :scale="24"
  :bevel-depth="12"
  :aberration="1.2"
  :tint="0.8"
  content-class-name="tw:p-6"
>
  <h2>新的内容区块</h2>
</LiquidGlass>
```

颜色、透明度、高光和阴影在 `apps/web/app/assets/css/liquid-glass.css` 中集中配置。已有批量区域不需要逐个包裹新组件。顶部导航使用 Vue 组件作为实际落地点。

## 验证

`pnpm test` 包含纯折射几何检查；`pnpm test:e2e` 包含批量接入、路由清理、资源数量、贴图尺寸、主题切换、弹窗输入、手机、减少动画、减少透明度和编码失败降级。生产构建与 EdgeOne 冒烟检查继续沿用现有命令，无数据库迁移或新增环境变量。
