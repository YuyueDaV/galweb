export default defineEventHandler(event=>{
 setHeader(event,'Content-Type','text/plain; charset=utf-8')
 return 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /notifications\nDisallow: /library\nDisallow: /api/\nSitemap: '+new URL('/sitemap.xml',useRuntimeConfig(event).public.siteUrl).href+'\n'
})
