export default defineEventHandler(async event=>{
 const config=useRuntimeConfig(event),escape=(value:string)=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!))
 const urls=['/','/works','/ranking','/awards','/about','/community']
 const first=await $fetch<{items:{id:string}[],total:number}>(config.apiBase+'/api/posts?limit=100&page=1')
 for(const item of first.items)urls.push('/post/'+encodeURIComponent(item.id))
 for(let page=2;page<=Math.ceil(first.total/100);page++){const data=await $fetch<{items:{id:string}[]}>(config.apiBase+'/api/posts?limit=100&page='+page);for(const item of data.items)urls.push('/post/'+encodeURIComponent(item.id))}
 const works=await $fetch<{rank:number}[]>(config.apiBase+'/api/works');for(const work of works)urls.push('/works/'+work.rank)
 setHeader(event,'Content-Type','application/xml; charset=utf-8');setHeader(event,'Cache-Control','no-store')
 return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(path=>'<url><loc>'+escape(new URL(path,config.public.siteUrl).href)+'</loc></url>').join('')+'</urlset>'
})
