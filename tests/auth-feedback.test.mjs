import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'

const webRequire=createRequire(new URL('../apps/web/package.json',import.meta.url)),apiRequire=createRequire(new URL('../apps/api/package.json',import.meta.url))
const vue=webRequire('vue'),{parse,compileTemplate}=webRequire('vue/compiler-sfc'),{renderToString}=webRequire('vue/server-renderer'),ts=apiRequire('typescript')
const source=await readFile(new URL('../apps/web/app/components/AuthPanel.vue',import.meta.url),'utf8'),{descriptor}=parse(source)
const transpile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
const templateModule={exports:{}}
new Function('require','exports',transpile(compileTemplate({source:descriptor.template.content,filename:'AuthPanel.vue',id:'auth-feedback-test'}).code))(webRequire,templateModule.exports)

function panel(t){
 const scope=vue.effectScope(),requests=[],notifications=[],loginOpen=vue.ref(true)
 const auth={user:vue.ref(null),request:(url,body)=>new Promise((resolve,reject)=>requests.push({url,body,resolve,reject})),login:async()=>{throw new Error('账号或密码不正确。')}}
 const bindings=scope.run(()=>new Function('ref','computed','watch','onMounted','onBeforeUnmount','useAuth','useForum',transpile(descriptor.scriptSetup.content)+'\nreturn {auth,loginOpen,mode,username,email,password,confirmPassword,code,challengeId,error,success,busy,cooldown,mismatched,send,submit,logout}')(vue.ref,vue.computed,vue.watch,()=>{},()=>{},()=>auth,()=>({loginOpen,notify:message=>notifications.push(message)})))
 t.after(()=>scope.stop())
 const html=()=>renderToString(vue.createSSRApp({setup:()=>bindings,render:templateModule.exports.render,components:{AppIcon:{render:()=>null},UserAvatar:{render:()=>null},NuxtLink:{render:()=>null}}}))
 return {...bindings,requests,notifications,html}
}

test('注册发码和注册完成的提示在弹窗内显示，切换登录后仍保留成功消息',async t=>{
 const p=panel(t)
 p.mode.value='register';p.email.value='tester@example.com';p.username.value='tester'
 const sending=p.send();p.requests.shift().resolve({challengeId:'challenge',retryAfter:60,message:'验证码已发送，请检查邮箱。'});await sending
 assert.match(await p.html(),/class="auth-feedback" role="status"[^>]*>验证码已发送/)
 assert.equal(p.challengeId.value,'challenge');assert.equal(p.cooldown.value,60)
 p.password.value=p.confirmPassword.value='long-test-password';p.code.value='123456'
 const registering=p.submit();assert.equal(p.requests[0].url,'/auth/register');p.requests.shift().resolve({});await registering;await vue.nextTick()
 assert.equal(p.mode.value,'login');assert.equal(p.password.value,'')
 assert.match(await p.html(),/class="auth-feedback" role="status"[^>]*>注册成功，请使用用户名或邮箱和密码登录。/)
 assert.deepEqual(p.notifications,[])
 p.mode.value='register';assert.equal(p.success.value,'')
})

test('失败提示在弹窗中显示，重新操作会清除旧消息，找回密码同样显示成功结果',async t=>{
 const p=panel(t)
 await p.submit();assert.match(await p.html(),/class="auth-feedback is-error" role="alert"[^>]*>账号或密码不正确。/)
 p.mode.value='reset';assert.equal(p.error.value,'');p.email.value='tester@example.com'
 const failed=p.send();p.requests.shift().reject(new Error('请稍后再试。'));await failed
 assert.match(await p.html(),/role="alert"[^>]*>请稍后再试。/)
 const sending=p.send();assert.equal(p.error.value,'');p.requests.shift().resolve({challengeId:'reset',retryAfter:60,message:'验证码已发送。'});await sending
 p.password.value=p.confirmPassword.value='new-test-password';p.code.value='123456'
 const resetting=p.submit();p.requests.shift().resolve({});await resetting;await vue.nextTick()
 assert.match(await p.html(),/role="status"[^>]*>密码已重置，请使用用户名或邮箱和新密码登录。/)
 p.loginOpen.value=false;assert.equal(p.success.value,'')
})
