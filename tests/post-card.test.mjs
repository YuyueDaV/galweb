import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'

const webRequire=createRequire(new URL('../apps/web/package.json',import.meta.url))
const apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url))
const {parse,compileScript}=webRequire('vue/compiler-sfc'),ts=apiRequire('typescript')
const {createSSRApp,defineComponent,h,ref,computed}=webRequire('vue'),{renderToString}=webRequire('vue/server-renderer')

test('帖子卡片实际渲染：上传图片、置顶上传图、原书架封面与无配图',async()=>{
 const source=await readFile(new URL('../apps/web/app/components/PostCard.vue',import.meta.url),'utf8')
 const script=compileScript(parse(source).descriptor,{id:'post-card-test',inlineTemplate:true})
 const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const module={exports:{}}
 const bookmarks=ref([]),pending=ref(false)
 new Function('require','module','exports','ref','computed','useForum','useAuth',code)(webRequire,module,module.exports,ref,computed,()=>({bookmarks,toggleBookmark(){},reactionPending:()=>pending.value,replyCount:p=>p.replies}),()=>({user:ref(null)}))
 const render=async post=>{
  const app=createSSRApp(module.exports.default,{post})
  app.component('NuxtLink',defineComponent({props:['to'],setup:(p,{slots})=>()=>h('a',{href:typeof p.to==='string'?p.to:'/'},slots.default?.())}))
  app.component('AppIcon',()=>h('i'))
  app.component('UserAvatar',()=>h('span'))
  app.component('WorkCover',defineComponent({props:['rank'],setup:p=>()=>h('img',{src:'/covers/'+p.rank})}))
  return renderToString(app)
 }
 const post={id:'fixture',title:'配图帖子',author:'同好',avatarColor:'orange',excerpt:'正文摘要',time:'今天',category:'作品讨论',tags:[],replies:0,views:0,likes:0}
 const uploaded=await render({...post,uploadedImage:'/api/assets/example-image'})
 assert.match(uploaded,/src="\/api\/assets\/example-image"/);assert.match(uploaded,/loading="lazy"/)
 assert.match(await render({...post,pinned:true,uploadedImage:'/api/assets/pinned-image'}),/src="\/api\/assets\/pinned-image"/)
 assert.match(await render({...post,image:3}),/src="\/covers\/3"/)
 assert.doesNotMatch(await render(post),/class="post-thumbnail"/)
 const stats=await render({...post,views:23,replies:4})
 assert.match(stats,/aria-label="23 次浏览"/);assert.match(stats,/href="\/post\/fixture#replies"[^>]*aria-label="4 条回复"/)
 bookmarks.value=['fixture'];pending.value=true
 const saved=await render(post)
 assert.match(saved,/class="saved"[^>]*aria-label="取消收藏帖子"[^>]*aria-pressed="true"[^>]*disabled[^>]*aria-busy="true"/)
})
