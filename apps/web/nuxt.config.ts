export default defineNuxtConfig({
  compatibilityDate: '2026-10-30',
  devtools: { enabled: false },
  telemetry: false,
  runtimeConfig: { apiBase: 'http://127.0.0.1:3200' },
  css: ['~/assets/css/main.css', '~/assets/css/awards.css'],
  app: {
    head: {
      title: '澄之响 · 故事之外，总有回响',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'description', content: '南京工程学院澄之响视觉小说同好会。分享视觉小说，收藏阅读余韵，找到一起聊故事的人。' },
        { name: 'theme-color', content: '#f6f5f1' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
