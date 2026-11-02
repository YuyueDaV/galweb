<script setup lang="ts">
const auth=useAuth(),{loginOpen,notify}=useForum()
const mode=ref<'login'|'register'|'reset'>('login')
const username=ref(''),email=ref(''),password=ref(''),confirmPassword=ref(''),code=ref(''),challengeId=ref('')
const error=ref(''),success=ref(''),busy=ref(false),cooldown=ref(0)
const mismatched=computed(()=>mode.value!=='login'&&!!confirmPassword.value&&password.value!==confirmPassword.value)
let timer:ReturnType<typeof setInterval>|undefined
onMounted(()=>timer=setInterval(()=>{if(cooldown.value>0)cooldown.value--},1000))
onBeforeUnmount(()=>clearInterval(timer))
watch([email,mode,loginOpen],()=>{challengeId.value='';code.value='';error.value='';success.value=''}, {flush:'sync'})
watch(mode,()=>{password.value='';confirmPassword.value=''})
async function send(){
 if(busy.value)return
 busy.value=true;error.value='';success.value=''
 const requestedEmail=email.value,requestedMode=mode.value
 try{const data=await auth.request<{challengeId:string,retryAfter:number,message:string}>(mode.value==='reset'?'/auth/password-reset/request':'/auth/registration-code',{email:email.value});if(email.value!==requestedEmail||mode.value!==requestedMode||!loginOpen.value)return;challengeId.value=data.challengeId;cooldown.value=data.retryAfter;success.value=data.message}
 catch(e){error.value=(e as Error).message}finally{busy.value=false}
}
async function submit(){
 if(busy.value)return
 error.value='';success.value=''
 if(mismatched.value){error.value='两次输入的密码不一致。';return}
 busy.value=true
 try{
  if(mode.value==='login'){await auth.login(username.value,password.value);loginOpen.value=false;password.value='';notify('登录成功。')}
  else{const registering=mode.value==='register';await auth.request(registering?'/auth/register':'/auth/password-reset/confirm',{email:email.value,password:password.value,confirmPassword:confirmPassword.value,code:code.value,challengeId:challengeId.value,...(registering?{username:username.value}:{})});mode.value='login';success.value=registering?'注册成功，请使用用户名和密码登录。':'密码已重置，请使用用户名和新密码登录。'}
 }catch(e){error.value=(e as Error).message}finally{busy.value=false}
}
async function logout(){try{await auth.logout();loginOpen.value=false;notify('已退出登录。')}catch(e){error.value=(e as Error).message}}
</script>
<template>
 <div class="auth-panel">
  <template v-if="auth.user.value">
   <h2>你好，{{ auth.user.value.nickname }}。</h2>
   <div class="account-summary"><UserAvatar :src="auth.user.value.avatarUrl" :name="auth.user.value.nickname" size="4rem" /><p>{{ auth.user.value.signature||'故事之外，期待与你相遇。' }}</p><NuxtLink to="/account" class="button primary" @click="loginOpen=false">进入用户中心<AppIcon name="arrowRight" :size="16" /></NuxtLink></div>
   <div class="account-actions"><NuxtLink v-if="auth.user.value.role!=='member'" to="/admin" @click="loginOpen=false">进入管理中心</NuxtLink><button class="button secondary" @click="logout">退出登录</button></div>
  </template>
  <template v-else>
   <h2>{{ mode==='register'?'让故事，从这里开始。':mode==='reset'?'重新找回你的账号。':'很高兴，再次遇见你。' }}</h2>
   <div class="auth-tabs"><button :disabled="busy" :aria-pressed="mode==='login'" @click="mode='login'">登录</button><button :disabled="busy" :aria-pressed="mode==='register'" @click="mode='register'">邮箱注册</button><button :disabled="busy" :aria-pressed="mode==='reset'" @click="mode='reset'">找回密码</button></div>
   <div v-if="error||success" class="auth-feedback" :class="{'is-error':error}" :role="error?'alert':'status'" aria-atomic="true">{{ error||success }}</div>
   <form class="award-form" :aria-busy="busy" @submit.prevent="submit">
    <label v-if="mode!=='reset'">用户名<input v-model="username" aria-label="用户名" :aria-describedby="mode==='register'?'username-help':undefined" required :minlength="mode==='register'?3:1" :maxlength="mode==='register'?24:128" autocomplete="username" autocapitalize="none" spellcheck="false" :placeholder="mode==='register'?'3–24 位中文、字母、数字或下划线':'输入注册时的用户名'" /><small v-if="mode==='register'" id="username-help">用于登录，注册后不可修改；昵称可在注册后设置。</small></label>
    <label v-if="mode!=='login'">邮箱<input v-model="email" type="email" required autocomplete="email" maxlength="254" /></label>
    <label>{{ mode==='reset'?'新密码':'密码' }}<input v-model="password" type="password" required :minlength="mode==='login'?1:12" maxlength="128" :placeholder="mode==='login'?'输入密码':'12–128 个字符'" :autocomplete="mode==='login'?'current-password':'new-password'" /></label>
    <label v-if="mode!=='login'">确认密码<input v-model="confirmPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password" :aria-invalid="mismatched" /></label>
    <p v-if="mismatched" class="form-error" role="alert">两次输入的密码不一致。</p>
    <label v-if="mode!=='login'">验证码<span class="verification-row"><input v-model="code" aria-label="验证码" required pattern="[0-9]{6}" maxlength="6" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位邮箱验证码" /><button type="button" class="button secondary" :disabled="busy||cooldown>0||!email" @click="send">{{ cooldown?`${cooldown} 秒后重发`:'发送验证码' }}</button></span></label>
    <button class="button primary" :disabled="busy||mismatched||(mode!=='login'&&!challengeId)">{{ busy?'处理中…':mode==='register'?'注册账号':mode==='reset'?'重置密码':'登录' }}</button>
   </form>
  </template>
  <p v-if="auth.user.value&&error" class="form-error" role="alert">{{ error }}</p>
 </div>
</template>
<style scoped>
.account-summary{display:grid;justify-items:center;gap:1rem;margin-top:1rem}.account-summary p{font-size:.7rem;line-height:1.8;color:var(--subtle);white-space:pre-wrap;overflow-wrap:anywhere}.account-summary>.button{width:100%}
.auth-feedback{margin:.8rem 0;padding:.65rem .8rem;border:1px solid var(--line);border-radius:.4rem;background:var(--hero);color:var(--ink);font-size:.7rem;font-weight:400;line-height:1.7;overflow-wrap:anywhere}.auth-feedback.is-error{color:#b5432d;background:rgba(181,67,45,.07);border-color:rgba(181,67,45,.25)}

.auth-panel{text-align:left}.auth-panel h2{font-family:var(--serif);font-size:1.4rem;line-height:1.45;margin:0 0 .7rem}.auth-tabs{display:flex;gap:1rem;margin:.7rem 0}.auth-tabs button{font-size:.7rem;color:var(--subtle);padding:0 0 .3rem}.auth-tabs button[aria-pressed=true]{color:var(--orange);border-bottom:1px solid currentColor}.auth-panel form{display:grid;gap:.5rem}.auth-panel .award-form>label{display:grid;gap:.25rem;margin:0}.auth-panel .award-form input{margin:0;padding:.5rem .65rem;line-height:1.4}.auth-panel .award-form small{font-size:.55rem;font-weight:400;color:var(--muted);line-height:1.6}.auth-panel .button{margin:0}.verification-row{display:flex;align-items:stretch;gap:.5rem;min-width:0}.verification-row>input{flex:1;min-width:0;width:0}.verification-row>.button{width:auto;min-height:0;line-height:1.4;flex-shrink:0;font-size:.65rem;padding:.5rem .65rem}.account-actions{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:1rem;font-size:.7rem}.account-actions>.button{width:auto}.account-email{font-size:.7rem;color:var(--subtle);overflow-wrap:anywhere}.auth-panel input[readonly]{color:var(--muted)}.auth-panel>.form-error{margin-top:.6rem}
@media(max-width:875px){.auth-panel .award-form input,.verification-row>.button{min-height:2.75rem}}
</style>
