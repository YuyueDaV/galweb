<script setup lang="ts">
import {prepareAvatar} from '~/utils/avatar'
const auth=useAuth(),{loginOpen,notify,loadFeed,clearPersonalData}=useForum()
const nickname=ref(''),signature=ref(''),avatarAssetId=ref<string|null>(null)
const avatarInput=ref<HTMLInputElement|null>(null),uploading=ref(false),saving=ref(false),error=ref(''),saved=ref(false)
const avatarError=ref(''),avatarFeedback=ref(''),uploadStage=ref<'processing'|'uploading'>('processing')
const roleNames={member:'社区成员',admin:'管理员',super_admin:'超级管理员'}
const deletionOpen=ref(false),deleting=ref(false),deletionPassword=ref(''),deletionConfirmation=ref(''),deletionError=ref(''),deletionInput=ref<HTMLInputElement|null>(null)
const personalSpacePath=computed(()=>auth.user.value?'/user/'+encodeURIComponent(auth.user.value.id):null)
const avatarUrl=computed(()=>avatarAssetId.value?'/api/assets/'+avatarAssetId.value:null)
const dirty=computed(()=>!!auth.user.value&&(nickname.value!==auth.user.value.nickname||signature.value!==(auth.user.value.signature||'')||avatarAssetId.value!==(auth.user.value.avatarAssetId||null)))
const signatureLength=computed(()=>Array.from(signature.value).length)
watch(()=>auth.user.value,user=>{nickname.value=user?.nickname||'';signature.value=user?.signature||'';avatarAssetId.value=user?.avatarAssetId||null},{immediate:true})
watch([nickname,signature,avatarAssetId],()=>{saved.value=false})
onMounted(()=>auth.initialize())
useSeoMeta({title:'用户中心 · 澄之响',robots:'noindex,nofollow'})
async function uploadAvatar(event:Event){
 const input=event.target as HTMLInputElement,file=input.files?.[0]
 if(!file)return
 if(uploading.value||deleting.value||saving.value){input.value='';return}
 error.value='';avatarError.value='';avatarFeedback.value='';saved.value=false
 uploading.value=true;uploadStage.value='processing'
 try{
  const image=await prepareAvatar(file)
  uploadStage.value='uploading'
  const form=new FormData();form.append('file',image)
  avatarAssetId.value=(await auth.request<{id:string}>('/uploads',form)).id
  avatarFeedback.value='头像已上传，点击“保存资料”后生效。'
  notify(avatarFeedback.value)
 }
 catch(cause){avatarError.value=(cause as Error).message||'上传失败，请稍后重试。';notify('头像上传失败：'+avatarError.value)}
 finally{uploading.value=false;input.value=''}
}
async function save(){
 if(saving.value||uploading.value||deleting.value)return
 error.value=''
 if(!nickname.value.trim()||nickname.value.trim().length>24){error.value='昵称需为 1–24 个字符。';return}
 if(signatureLength.value>120){error.value='个性签名最多 120 个字。';return}
 saving.value=true
 try{await auth.updateProfile({nickname:nickname.value.trim(),signature:signature.value.trim(),avatarAssetId:avatarAssetId.value});saved.value=true;avatarFeedback.value='';notify('个人资料已保存。');await loadFeed()}
 catch(cause){error.value=(cause as Error).message;notify('保存失败：'+error.value)}
 finally{saving.value=false}
}
function reset(){const user=auth.user.value;if(!user)return;nickname.value=user.nickname;signature.value=user.signature||'';avatarAssetId.value=user.avatarAssetId||null;error.value='';avatarError.value='';avatarFeedback.value='';saved.value=false}
function removeAvatar(){avatarAssetId.value=null;avatarError.value='';avatarFeedback.value='已恢复默认预览，点击“保存资料”后生效。'}
async function logout(){try{await auth.logout();await navigateTo('/');notify('已退出登录。')}catch(cause){error.value=(cause as Error).message}}
function cancelDeletion(){deletionOpen.value=false;deletionPassword.value='';deletionConfirmation.value='';deletionError.value=''}
async function openDeletion(){deletionOpen.value=true;deletionError.value='';await nextTick();deletionInput.value?.focus()}
async function deleteAccount(){
 if(deleting.value||saving.value||uploading.value)return
 deletionError.value=''
 if(!deletionPassword.value||deletionConfirmation.value!=='注销账号'){deletionError.value='请填写当前密码，并输入“注销账号”确认。';return}
 deleting.value=true
 try{const result=await auth.deleteAccount(deletionPassword.value,deletionConfirmation.value);cancelDeletion();clearPersonalData();await navigateTo('/');notify(result.message)}
 catch(cause){deletionPassword.value='';deletionError.value=(cause as Error).message;notify('注销失败：'+deletionError.value)}
 finally{deleting.value=false}
}
</script>

<template>
 <div class="account-page">
  <p class="page-kicker"><span class="category-dot orange"></span> MY LITTLE CORNER</p>
  <div class="account-heading"><div><p class="eyebrow">YOUR PROFILE, YOUR STORY</p><h1>我的小角落<span>。</span></h1><p>让同好认识你，也让每一次回响有自己的模样。</p></div><div class="account-heading-actions"><NuxtLink v-if="personalSpacePath" :to="personalSpacePath" class="button primary"><AppIcon name="home" :size="17" />我的个人空间<AppIcon name="arrowUpRight" :size="16" /></NuxtLink><NuxtLink to="/" class="text-link">回到社区<AppIcon name="arrowUpRight" :size="16" /></NuxtLink></div></div>
  <div v-if="!auth.ready.value" class="account-guest" role="status">正在读取个人资料…</div>
  <template v-else-if="auth.user.value">
   <div class="account-grid">
    <section class="profile-card" aria-labelledby="profile-title">
     <div class="profile-card-heading"><h2 id="profile-title"><AppIcon name="pen" />个人资料</h2><span>在社区展示的你</span></div>
     <form class="profile-form" @submit.prevent="save">
      <fieldset :disabled="saving||uploading||deleting">
       <legend class="sr-only">编辑个人资料</legend>
       <div class="avatar-editor"><button type="button" class="avatar-picker" aria-label="选择并上传头像" :aria-busy="uploading" @click="avatarInput?.click()"><UserAvatar :src="avatarUrl" :name="nickname" size="5rem" /><span class="avatar-edit-badge"><AppIcon name="image" :size="15" /></span></button><div><h3>个人头像</h3><div class="avatar-actions"><button type="button" class="button secondary" @click="avatarInput?.click()"><AppIcon name="image" :size="15" />{{ uploading?(uploadStage==='processing'?'正在处理…':'正在上传…'):'选择图片' }}</button><button v-if="avatarAssetId" type="button" class="text-link" @click="removeAvatar">恢复默认</button></div><p>JPG、PNG、WebP · 原图最大 32 MB</p><small>自动居中裁切并压缩为头像，无需手动缩小文件。</small><p v-if="avatarError" class="avatar-error" role="alert">{{ avatarError }}</p><p v-else-if="uploading" class="avatar-feedback" role="status">{{ uploadStage==='processing'?'正在处理图片，请稍候…':'正在上传头像，请稍候…' }}</p><p v-else-if="avatarFeedback" class="avatar-feedback" role="status">{{ avatarFeedback }}</p></div></div>
       <input ref="avatarInput" type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="头像图片文件" @change="uploadAvatar" />
       <label class="profile-field">昵称<input v-model="nickname" autocomplete="nickname" required maxlength="24" placeholder="希望同好如何称呼你" /><small>用于帖子与回复展示；修改昵称不会改变登录用户名。</small></label>
       <label class="profile-field">个性签名<textarea v-model="signature" rows="3" maxlength="120" placeholder="一句喜欢的台词，或是此刻想说的话。" aria-describedby="signature-help"></textarea><span id="signature-help" class="signature-help"><small>会显示在用户中心的个人名片上。</small><span>{{ signatureLength }} / 120</span></span></label>
      </fieldset>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="profile-form-bottom"><p role="status"><template v-if="uploading">{{ uploadStage==='processing'?'正在处理图片…':'图片正在上传…' }}</template><template v-else-if="saved"><AppIcon name="check" :size="15" />个人资料已保存</template><template v-else>{{ dirty?'修改尚未保存':'每一声回响，都有自己的模样。' }}</template></p><div><button type="button" class="profile-reset" :disabled="!dirty||saving||uploading||deleting" @click="reset">撤销修改</button><button type="submit" class="button primary" :disabled="!dirty||saving||uploading||deleting||!nickname.trim()"><AppIcon name="check" :size="16" />{{ saving?'正在保存…':'保存资料' }}</button></div></div>
     </form>
    </section>
    <aside class="account-side">
     <section class="profile-preview" aria-label="个人名片预览"><DecorativeSpark class="profile-preview-spark" /><p class="eyebrow">A LITTLE ABOUT YOU</p><UserAvatar :src="avatarUrl" :name="nickname" size="4.25rem" /><h2>{{ nickname.trim()||'你的昵称' }}</h2><span class="profile-role">{{ roleNames[auth.user.value.role] }}</span><p class="preview-signature">{{ signature.trim()||'故事之外，期待与你相遇。' }}</p><span class="preview-note">个人名片预览</span><NuxtLink v-if="personalSpacePath" :to="personalSpacePath" class="button secondary profile-space-link">查看我的个人空间<AppIcon name="arrowUpRight" :size="16" /></NuxtLink><p v-if="dirty" class="profile-space-hint">个人空间展示已保存的资料。</p></section>
     <section class="profile-card account-details"><div class="profile-card-heading"><h2><AppIcon name="info" />账号信息</h2></div><dl><div><dt>用户名</dt><dd>{{ auth.user.value.username }}<small>用于登录，不随昵称改变</small></dd></div><div><dt>邮箱</dt><dd>{{ auth.user.value.email }}<small>{{ auth.user.value.email.endsWith('.invalid')?'本地初始化账号的占位邮箱':'用于账号验证与找回密码' }}</small></dd></div></dl><div class="account-shortcuts"><NuxtLink v-if="auth.user.value" :to="'/user/'+auth.user.value.id" class="text-link">查看我的公开主页<AppIcon name="arrowUpRight" :size="16" /></NuxtLink><NuxtLink to="/?saved=1#discussions"><AppIcon name="bookmark" :size="16" />我的收藏<AppIcon name="arrowUpRight" :size="14" /></NuxtLink><NuxtLink v-if="auth.user.value.role!=='member'" to="/admin"><AppIcon name="filter" :size="16" />管理中心<AppIcon name="arrowUpRight" :size="14" /></NuxtLink><button type="button" :disabled="saving||uploading||deleting" @click="logout"><AppIcon name="login" :size="16" />退出登录</button></div></section>
    </aside>
   </div>
   <section class="profile-card deletion-zone" aria-labelledby="deletion-title">
    <div class="deletion-heading"><div><h2 id="deletion-title">注销账号</h2><p>退出登录后仍可回来；注销后，原账号将无法恢复。</p></div><button v-if="!deletionOpen" type="button" class="deletion-start" :disabled="saving||uploading||deleting" @click="openDeletion">注销我的账号</button></div>
    <form v-if="deletionOpen" class="deletion-form" @submit.prevent="deleteAccount">
     <ul><li>清除用户名、邮箱、昵称、头像和个性签名，立即退出所有设备；邮箱与用户名可重新注册。</li><li>帖子和回复保留，作者显示为“已注销用户”；点赞、收藏和选票清除，上传图片停止展示并清理。</li><li>待审核提名撤回，已通过提名匿名保留；已公布榜单只匿名化提名者，不改变票数与名次。</li></ul>
     <p class="deletion-note">重新注册是一个全新账号，不会继承原账号内容或权限。登录、邮件验证码的频率限制继续保留。</p>
     <p v-if="auth.user.value.role==='super_admin'" class="deletion-note">最后一名有效超级管理员不能注销；请先交接给另一位超级管理员。</p>
     <label class="profile-field">当前密码<input ref="deletionInput" v-model="deletionPassword" type="password" required maxlength="128" autocomplete="current-password" :disabled="deleting" /></label>
     <label class="profile-field">请输入“注销账号”确认<input v-model="deletionConfirmation" required maxlength="4" autocomplete="off" :disabled="deleting" placeholder="注销账号" /></label>
     <p v-if="deletionError" class="form-error" role="alert">{{ deletionError }}</p>
     <div class="deletion-actions"><button type="button" class="button secondary" :disabled="deleting" @click="cancelDeletion">保留账号</button><button type="submit" class="button deletion-confirm" :disabled="deleting||saving||uploading||!deletionPassword||deletionConfirmation!=='注销账号'">{{ deleting?'正在注销…':'确认注销账号' }}</button></div>
    </form>
   </section>
  </template>
  <section v-else class="account-guest"><AppIcon name="users" :size="36" /><h2>你的小角落，等你回来。</h2><p>登录后即可设置头像、昵称和个性签名。</p><button class="button primary" @click="loginOpen=true">登录 / 加入<AppIcon name="arrowRight" :size="16" /></button></section>
 </div>
</template>

<style scoped>
.account-heading-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:12px;flex-shrink:0}
.account-heading-actions>.button{min-height:44px;border-radius:999px;font-size:14px;white-space:nowrap}
.account-heading-actions>.text-link{min-height:44px;font-size:14px;white-space:nowrap}
.profile-preview .preview-note{display:block}
.profile-preview .profile-space-link{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;width:100%;margin-top:16px;border-radius:999px;font-size:14px}
.profile-preview .profile-space-hint{margin-top:10px;color:var(--subtle);font-size:13px;line-height:1.7}
@media(max-width:600px){.account-page .account-heading{flex-direction:column;gap:16px}.account-heading-actions{width:100%;justify-content:space-between;gap:8px}.account-heading-actions>.button{flex:1}}
.deletion-zone{margin-top:1.5rem;border-color:#b96b5545}.deletion-heading{display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.25rem}.deletion-heading h2{font-size:.85rem;font-weight:500;color:#b65c45}.deletion-heading p,.deletion-note{font-size:.6rem;color:var(--subtle);line-height:1.9;margin-top:.4rem}.deletion-start{border:1px solid #b96b5566;border-radius:.4rem;padding:.5rem .75rem;color:#b65c45;font-size:.65rem;white-space:nowrap}.deletion-form{padding:0 1.25rem 1.25rem}.deletion-form ul{font-size:.65rem;line-height:1.9;color:var(--subtle);padding-left:1rem;margin:0 0 .75rem}.deletion-form>.profile-field{max-width:26rem;margin-top:1rem}.deletion-actions{display:flex;justify-content:flex-end;gap:.75rem;flex-wrap:wrap}.deletion-actions .button{font-size:.65rem}.deletion-confirm{background:#b85f49;color:#fff}.deletion-confirm:hover{background:#a44f3d}
@media(max-width:600px){.deletion-heading{align-items:flex-start;flex-direction:column}.deletion-heading p,.deletion-form ul,.deletion-note{font-size:.75rem}.deletion-start,.deletion-actions .button{font-size:.8rem;min-height:2.75rem}}
.account-page{font-family:'DM Sans','Microsoft YaHei','PingFang SC',system-ui,sans-serif;font-weight:400;font-synthesis:none}
.account-page .avatar-editor h3{font-weight:500}.account-page .profile-field,.account-page .profile-field small,.account-page .avatar-editor p,.account-page .avatar-editor small,.account-page .account-details dt,.account-page .account-details dd,.account-page .account-shortcuts{font-weight:400}
.account-page .avatar-editor .avatar-error{color:#c05e48;font-size:.65rem;line-height:1.7;margin-top:.5rem}.account-page .avatar-editor .avatar-feedback{color:var(--subtle);font-size:.6rem;line-height:1.7;margin-top:.5rem}

.account-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:1.25rem 0 1.75rem}.account-heading .eyebrow{font-size:.5rem;color:var(--orange);margin-bottom:.65rem}.account-heading h1{font-family:var(--serif);font-size:2.25rem;line-height:1.35;font-weight:500}.account-heading h1>span{color:var(--orange)}.account-heading p:not(.eyebrow){font-size:.7rem;color:var(--subtle);margin-top:.65rem;line-height:1.8}.account-heading>.text-link{font-size:.65rem;white-space:nowrap}
.account-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(14rem,1fr);gap:1.25rem;align-items:start}.profile-card{border:1px solid var(--line);border-radius:.75rem;background:var(--surface);min-width:0}.profile-card-heading{display:flex;align-items:center;justify-content:space-between;gap:.5rem;border-bottom:1px solid var(--line);padding:1rem 1.25rem}.profile-card-heading h2{display:flex;align-items:center;gap:.5rem;font-size:.8rem;font-weight:500}.profile-card-heading>span{font-size:.55rem;color:var(--muted)}.profile-form{padding:1.25rem}.profile-form fieldset{margin:0;padding:0;border:0;min-width:0}.avatar-editor{display:flex;align-items:center;gap:1rem;padding-bottom:1.5rem;margin-bottom:1.25rem;border-bottom:1px solid var(--line)}.avatar-editor h3{font-size:.7rem;margin-bottom:.5rem}.avatar-picker{position:relative;flex-shrink:0;background:transparent;border:0;padding:0;border-radius:50%;cursor:pointer;font-size:1.8rem}.avatar-picker:focus-visible{outline:2px solid var(--orange);outline-offset:4px}.avatar-edit-badge{position:absolute;right:0;bottom:0;display:grid;place-items:center;width:1.5rem;height:1.5rem;border-radius:50%;border:2px solid var(--surface);background:var(--orange);color:white}.avatar-actions{display:flex;align-items:center;gap:.75rem}.avatar-actions .button{font-size:.6rem;min-height:1.9rem;padding:.35rem .65rem}.avatar-actions .text-link{font-size:.55rem}.avatar-editor p,.avatar-editor small{display:block;font-size:.5rem;color:var(--muted);line-height:1.8;margin-top:.4rem}.avatar-editor small{margin-top:0}.profile-field{display:grid;gap:.5rem;margin-bottom:1.25rem;font-size:.7rem}.profile-field input,.profile-field textarea{width:100%;min-width:0;border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:.4rem;padding:.65rem .75rem;font:inherit;font-size:.7rem;line-height:1.8}.profile-field textarea{resize:vertical;min-height:5.5rem}.profile-field input:focus,.profile-field textarea:focus{outline:2px solid var(--orange);outline-offset:2px}.profile-field small,.signature-help{font-size:.5rem;color:var(--muted);line-height:1.8}.signature-help{display:flex;justify-content:space-between;gap:1rem}.signature-help>span{white-space:nowrap}.profile-form-bottom{display:flex;justify-content:space-between;align-items:center;gap:.75rem;border-top:1px solid var(--line);padding-top:1rem}.profile-form-bottom>p{display:flex;align-items:center;gap:.3rem;font-size:.5rem;color:var(--subtle);line-height:1.7}.profile-form-bottom>div{display:flex;align-items:center;gap:.75rem}.profile-form-bottom .button{font-size:.65rem;min-height:2.25rem;padding:.5rem .8rem;white-space:nowrap}.profile-reset{font-size:.55rem;white-space:nowrap;color:var(--subtle)}.profile-reset:disabled{opacity:.4;cursor:default}.account-side{display:grid;gap:1rem}.profile-preview{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:.75rem;padding:1.5rem;text-align:center;background:var(--hero,var(--bg))}.profile-preview .profile-preview-spark{position:absolute;right:-.5rem;top:-1.5rem;font-size:7rem;color:var(--orange);opacity:.08;pointer-events:none}.profile-preview .eyebrow{font-size:.45rem;color:var(--muted);margin-bottom:1rem}.profile-preview h2{font-family:var(--serif);font-size:1.3rem;font-weight:500;margin:.65rem 0 .35rem;overflow-wrap:anywhere}.profile-role{display:inline-block;font-size:.5rem;color:var(--orange);border:1px solid var(--line);border-radius:2rem;padding:.2rem .55rem}.preview-signature{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.65rem;color:var(--subtle);line-height:1.9;margin:1rem 0 1.25rem}.preview-note{font-size:.45rem;color:var(--muted);letter-spacing:.12em}.account-details dl{padding:0 1.25rem}.account-details dl>div{padding:.9rem 0;border-bottom:1px solid var(--line)}.account-details dt{font-size:.5rem;color:var(--muted);margin-bottom:.35rem}.account-details dd{font-size:.65rem;overflow-wrap:anywhere;margin:0}.account-details dd>small{display:block;font-size:.5rem;color:var(--muted);line-height:1.7;margin-top:.25rem}.account-shortcuts{padding:.75rem 1.25rem}.account-shortcuts>a,.account-shortcuts>button{display:flex;align-items:center;gap:.5rem;padding:.5rem 0;font-size:.6rem;color:var(--subtle);width:100%;text-align:left}.account-shortcuts>a>.app-icon:last-child{margin-left:auto}.account-guest{text-align:center;border:1px solid var(--line);border-radius:.75rem;background:var(--surface);padding:3rem 1rem}.account-guest>.app-icon{color:var(--orange)}.account-guest h2{font-family:var(--serif);font-size:1.5rem;margin:1rem 0}.account-guest p{font-size:.7rem;color:var(--subtle);margin-bottom:1.25rem}
@media(max-width:1150px){.account-grid{grid-template-columns:minmax(0,1fr)}.account-side{grid-template-columns:1fr 1fr}.profile-form-bottom>p{max-width:11rem}}
@media(max-width:600px){.account-heading{align-items:flex-start}.account-heading h1{font-size:1.8rem}.account-heading>.text-link{font-size:.6rem}.account-side{grid-template-columns:1fr}.profile-card-heading,.profile-form{padding:1rem}.profile-card-heading>span{display:none}.avatar-editor{gap:.75rem}.profile-form-bottom{flex-wrap:wrap}.profile-form-bottom>p{max-width:none}.profile-form-bottom>div{width:100%;justify-content:flex-end}.profile-field input,.profile-field textarea{font-size:1rem}.profile-field{font-size:.85rem}.profile-field small,.signature-help{font-size:.65rem}.avatar-editor p,.avatar-editor small{font-size:.6rem}.account-details dd{font-size:.85rem}.account-details dt,.account-details dd>small{font-size:.65rem}.profile-form-bottom .button{min-height:2.75rem;font-size:.8rem}.avatar-actions .button{min-height:2.5rem;font-size:.7rem}}
</style>
