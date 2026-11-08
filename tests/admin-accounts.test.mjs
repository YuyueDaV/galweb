import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {hasAwardPermission,permissionLabels,roleNames} from '../apps/web/app/utils/awards.ts'

const webRequire=createRequire(new URL('../apps/web/package.json',import.meta.url))
const apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url))
const {parse,compileScript}=webRequire('vue/compiler-sfc'),ts=apiRequire('typescript')
const vue=webRequire('vue'),{renderToString}=webRequire('vue/server-renderer')

async function component(path,globals){
 const source=await readFile(new URL(path,import.meta.url),'utf8')
 const script=compileScript(parse(source).descriptor,{id:'account-render-test',inlineTemplate:true})
 const code=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const module={exports:{}}
 const require=id=>id==='~/utils/awards'?{hasAwardPermission,permissionLabels,roleNames}:webRequire(id)
 new Function('require','module','exports',...Object.keys(globals),code)(require,module,module.exports,...Object.values(globals))
 return module.exports.default
}

async function renderAccounts(role,customFixtures){
 const fixtures=customFixtures||[
  {id:'image-user',username:'image-member',name:'有头像的成员',role:'member',status:'active',avatarUrl:'/api/assets/fixture-image'},
  {id:'text-user',username:'text-member',name:'默认头像成员',role:'member',status:'disabled',avatarUrl:null},
 ]
 const auth={ready:vue.ref(true),user:vue.ref({id:'viewer',role})}
 const identity={selectedId:vue.ref('viewer'),role:vue.ref(role),account:vue.ref({id:'viewer',name:'测试管理员'}),can:permission=>hasAwardPermission(role,permission)}
 const UserAvatar=await component('../apps/web/app/components/UserAvatar.vue',{ref:vue.ref,watch:vue.watch})
 const Accounts=await component('../apps/web/app/pages/admin/accounts.vue',{
  // Supply an already loaded response at the ref boundary. Lifecycle/network
  // behavior is separate; these assertions exercise the actual page template.
  ref:value=>vue.ref(Array.isArray(value)?fixtures:value===true?false:value),
  reactive:vue.reactive,computed:vue.computed,watch(){},onMounted(){},onBeforeUnmount(){},useSeoMeta(){},
  useAuth:()=>auth,usePreviewIdentity:()=>identity,useForum:()=>({loginOpen:vue.ref(false),notify(){}}),
 })
 const app=vue.createSSRApp(Accounts)
 app.component('UserAvatar',UserAvatar)
 app.component('AppIcon',()=>vue.h('i'))
 app.component('NuxtLink',vue.defineComponent({props:['to'],setup:(p,{slots})=>()=>vue.h('a',{href:p.to},slots.default?.())}))
 return renderToString(app)
}

test('账号列表实际渲染：显示上传头像，未设置头像时回退文字',async()=>{
 const html=await renderAccounts('super_admin')
 assert.match(html,/<img[^>]*src="\/api\/assets\/fixture-image"[^>]*alt="有头像的成员的头像"/)
 assert.match(html,/<span aria-hidden="true">默<\/span>/)
 assert.match(html,/aria-label="保存有头像的成员的角色"/)
})

test('普通管理员不能看到账号列表、角色权限矩阵或启停控件',async()=>{
 const html=await renderAccounts('admin')
 assert.match(html,/这里需要超级管理员身份/)
 assert.doesNotMatch(html,/fixture-image|image-member|text-member|<select|保存角色|禁用账号|启用账号|角色权限边界/)
})

test('普通成员直接访问账号权限页时不呈现账号列表或头像',async()=>{
 const html=await renderAccounts('member')
 assert.match(html,/这里需要超级管理员身份/)
 assert.doesNotMatch(html,/fixture-image|image-member|text-member|<select/)
})

test('仅最后一位有效超管的角色控件被禁用，并说明如何解除限制',async()=>{
 const owner={id:'viewer',username:'owner',name:'当前超管',role:'super_admin',status:'active',avatarUrl:null}
 const last=await renderAccounts('super_admin',[{...owner,isLastSuperAdmin:true}])
 assert.match(last,/<select[^>]*disabled[^>]*aria-label="当前超管的角色"/)
 assert.match(last,/最后一位有效超管；先提升另一账号/)
 const multiple=await renderAccounts('super_admin',[{...owner,isLastSuperAdmin:false}])
 assert.doesNotMatch(multiple,/<select[^>]*disabled/)
 assert.match(multiple,/有其他有效超级管理员时可以自行降级/)
})
