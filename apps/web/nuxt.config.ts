import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
export default defineNuxtConfig({
  vite: { plugins: [tailwindcss()] },
  buildDir: process.env.CZX_CHECK === '1' ? '.nuxt-check' : '.nuxt',
  nitro: process.env.CZX_CHECK === '1' ? { output: { dir: fileURLToPath(new URL('.output-check', import.meta.url)) } } : {},
  compatibilityDate: '2026-10-30',
  devtools: { enabled: false },
  telemetry: false,
  runtimeConfig: { apiBase: 'http://127.0.0.1:3200',public:{siteUrl:process.env.NUXT_PUBLIC_SITE_URL||'http://127.0.0.1:3100'} },
  css: ['~/assets/css/tailwind.css', '~/assets/css/tokens.css', '~/assets/css/main.css', '~/assets/css/awards.css', '~/assets/css/warm-glass.css', '~/assets/css/community.css', '~/assets/css/covers.css', '~/assets/css/foundations.css'],
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
