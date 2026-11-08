import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
const edgeoneBuild = process.env.CZX_EDGEONE_BUILD === '1'
export default defineNuxtConfig({
  vite: { plugins: [tailwindcss()] },
  buildDir: edgeoneBuild ? '.nuxt-edgeone' : process.env.CZX_CHECK === '1' ? '.nuxt-check' : '.nuxt',
  nitro: {
    // Bundle Markdown dependencies so production artifacts do not rely on
    // platform-specific pnpm symlinks for multiple versions of entities.
    externals: { inline: ['markdown-it', 'entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro'] },
    ...(edgeoneBuild
      ? {
          preset: 'node-server',
          output: {
            dir: fileURLToPath(new URL('.edgeone', import.meta.url)),
            publicDir: fileURLToPath(new URL('.edgeone/assets', import.meta.url)),
            serverDir: fileURLToPath(new URL('.edgeone/cloud-functions/ssr-node', import.meta.url)),
          },
        }
      : process.env.CZX_CHECK === '1'
        ? { output: { dir: fileURLToPath(new URL('.output-check', import.meta.url)) } }
        : {}),
  },
  compatibilityDate: '2026-10-30',
  devtools: { enabled: false },
  telemetry: false,
  runtimeConfig: {
    apiBase: process.env.NUXT_API_BASE || 'http://127.0.0.1:3200',
    apiProxySecret: '',
    edgeone: edgeoneBuild,
    public: { siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3100' },
  },
  css: [
    '~/assets/css/tailwind.css',
    '~/assets/css/tokens.css',
    '~/assets/css/main.css',
    '~/assets/css/awards.css',
    '~/assets/css/warm-glass.css',
    '~/assets/css/community.css',
    '~/assets/css/covers.css',
    '~/assets/css/catalog.css',
    '~/assets/css/foundations.css',
    '~/assets/css/liquid-glass.css',
  ],
  app: {
    head: {
      title: '澄之响 · 故事之外，总有回响',
      htmlAttrs: { lang: 'zh-CN' },
      script: [{key:'theme-before-paint',innerHTML:"(function(){try{var t=localStorage.getItem('chengzhixiang-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}})()",tagPosition:'head',tagPriority:'critical'}],
      meta: [
        {
          name: 'description',
          content: '南京工程学院澄之响视觉小说同好会。分享视觉小说，收藏阅读余韵，找到一起聊故事的人。',
        },
        { name: 'theme-color', content: '#f6f5f1' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
})
