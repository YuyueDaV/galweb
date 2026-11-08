import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'

const webRequire=createRequire(new URL('../apps/web/package.json',import.meta.url)),apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url))
const {ref,computed}=webRequire('vue'),ts=apiRequire('typescript')

test('前端分页状态：详情缓存不混入列表、重复加载保护、旧请求不覆盖、加载失败可重试',async()=>{
 const source=(await readFile(new URL('../apps/web/app/composables/useForum.ts',import.meta.url),'utf8')).replaceAll('import.meta.client','false')
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const state=new Map(),requests=[],module={exports:{}}
 const auth={user:ref(null),request:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))}
 const useState=(key,initial)=>{if(!state.has(key))state.set(key,ref(initial()));return state.get(key)}
 new Function('require','module','exports','useState','computed','useAuth',code)(name=>name==='~/data/forum'?{initialPosts:[]}:webRequire(name),module,module.exports,useState,computed,()=>auth)
 const forum=module.exports.useForum(),items=Array.from({length:8},(_,i)=>({id:'post-'+i,title:'帖子 '+i}))
 const first=forum.loadFeed({tab:'featured'}),firstRequest=requests.shift()
 assert.equal(new URL(firstRequest.url,'http://local').searchParams.get('limit'),'6')
 firstRequest.resolve({items:items.slice(0,6),total:8,page:1,limit:6});await first
 forum.posts.value.push({id:'unrelated-detail',title:'详情缓存'})
 assert.equal(forum.feedPosts.value.length,6);assert.equal(forum.feedTotal.value,8)
 const more=forum.loadFeed(undefined,true),duplicate=forum.loadFeed(undefined,true)
 assert.equal(requests.length,1);const second=requests.shift();assert.equal(new URL(second.url,'http://local').searchParams.get('page'),'2')
 second.resolve({items:items.slice(6),total:8,page:2,limit:6});await Promise.all([more,duplicate])
 assert.equal(forum.feedPosts.value.length,8);assert.equal(forum.hasMore.value,false)
 const old=forum.loadFeed({q:'old'}),oldRequest=requests.shift(),latest=forum.loadFeed({q:'new'}),latestRequest=requests.shift()
 latestRequest.resolve({items:[{id:'new-result'}],total:1,page:1,limit:6});await latest
 oldRequest.resolve({items:[{id:'old-result'}],total:1,page:1,limit:6});await old
 assert.deepEqual(forum.feedPosts.value.map(p=>p.id),['new-result']);assert.equal(forum.loadingFeed.value,false)
 const reset=forum.loadFeed({q:'retry'});requests.shift().resolve({items:items.slice(0,6),total:8,page:1,limit:6});await reset
 const failed=forum.loadFeed(undefined,true);requests.shift().reject(new Error('连接失败，请重试。'));await failed
 assert.equal(forum.feedPosts.value.length,6);assert.match(forum.feedError.value,/连接失败/)
 const retry=forum.loadFeed(undefined,true),retryRequest=requests.shift();assert.equal(new URL(retryRequest.url,'http://local').searchParams.get('page'),'2')
 retryRequest.resolve({items:items.slice(6),total:8,page:2,limit:6});await retry
 assert.equal(forum.feedPosts.value.length,8);assert.equal(forum.feedError.value,'')
 const stale=forum.loadFeed({saved:'true'}),staleRequest=requests.shift()
 forum.clearPersonalData();staleRequest.resolve({items:[{id:'private-old-result'}],total:1,page:1,limit:6});await stale
 assert.equal(forum.posts.value.length,0);assert.equal(forum.replies.value.length,0);assert.equal(forum.feedPosts.value.length,0);assert.equal(forum.bookmarks.value.length,0);assert.equal(forum.feedTotal.value,0)
})

test('浏览数更新、收藏重复点击保护、失败保留状态、登录同步隔离',async()=>{
 const source=(await readFile(new URL('../apps/web/app/composables/useForum.ts',import.meta.url),'utf8')).replaceAll('import.meta.client','false')
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const state=new Map(),requests=[],module={exports:{}}
 const auth={user:ref({id:'first-user'}),request:(url,body,method)=>new Promise((resolve,reject)=>requests.push({url,body,method,resolve,reject}))}
 const useState=(key,initial)=>{if(!state.has(key))state.set(key,ref(initial()));return state.get(key)}
 new Function('require','module','exports','useState','computed','useAuth',code)(name=>name==='~/data/forum'?{initialPosts:[]}:webRequire(name),module,module.exports,useState,computed,()=>auth)
 const forum=module.exports.useForum();forum.posts.value.push({id:'post',views:0})
 const viewing=forum.recordView('post');assert.equal(requests[0].url,'/posts/post/views');requests.shift().resolve({views:7});await viewing
 assert.equal(forum.posts.value[0].views,7)
 const saving=forum.toggleBookmark('post');await forum.toggleBookmark('post');assert.equal(requests.length,1);assert.equal(forum.reactionPending('post','bookmark'),true)
 const put=requests.shift();assert.equal(put.method,'PUT');assert.deepEqual(put.body,{kind:'bookmark',active:true});put.resolve({active:true});await saving
 assert.deepEqual([...forum.bookmarks.value],['post']);assert.equal(forum.reactionPending('post','bookmark'),false)
 const failed=forum.toggleBookmark('post');requests.shift().reject(new Error('保存失败，请重试。'));await failed
 assert.deepEqual([...forum.bookmarks.value],['post']);assert.equal(forum.toast.value,'保存失败，请重试。')
 const oldSync=forum.syncMine();auth.user.value={id:'second-user'};requests.shift().resolve({bookmarks:['old-private'],likes:[]});await oldSync
 assert.ok(!forum.bookmarks.value.includes('old-private'))
 const sync=forum.syncMine();requests.shift().resolve({bookmarks:['restored'],likes:[]});await sync
 assert.deepEqual([...forum.bookmarks.value],['restored'])
 const removing=forum.toggleBookmark('restored');requests.shift().resolve({active:false});await removing;assert.deepEqual([...forum.bookmarks.value],[])
 auth.user.value=null;await forum.syncMine();await forum.toggleBookmark('post');assert.equal(forum.loginOpen.value,true);assert.equal(requests.length,0)
})


test('话题刷新：隐藏后的新结果不被旧请求覆盖，失败显示错误并可重试',async()=>{
 const source=await readFile(new URL('../apps/web/app/composables/useTopics.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const state=new Map(),requests=[],module={exports:{}}
 const useState=(key,initial)=>{if(!state.has(key))state.set(key,ref(initial()));return state.get(key)}
 const auth={request:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))}
 new Function('module','exports','useState','useAuth',code)(module,module.exports,useState,()=>auth)
 const topics=module.exports.useTopics()
 const old=topics.load(),oldRequest=requests.shift(),fresh=topics.load(),freshRequest=requests.shift()
 freshRequest.resolve([]);await fresh
 oldRequest.resolve([{name:'已隐藏的话题',count:1,latestAt:1}]);await old
 assert.deepEqual([...topics.topics.value],[]);assert.equal(topics.loading.value,false)
 const failure=topics.load();requests.shift().reject(new Error('话题连接失败'));await failure
 assert.equal(topics.error.value,'话题连接失败');assert.deepEqual([...topics.topics.value],[])
 const retry=topics.load();requests.shift().resolve([{name:'重新公开的话题',count:2,latestAt:2}]);await retry
 assert.equal(topics.error.value,'');assert.equal(topics.topics.value[0].count,2)
})
