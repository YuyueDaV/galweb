<script setup lang="ts">
import type {Category,Work} from '~/types/forum'
import {categories} from '~/data/forum'
const {composerOpen,loginOpen,createPost,composerWorkId}=useForum(),auth=useAuth()
const composeDialog=ref<HTMLDialogElement|null>(null),loginDialog=ref<HTMLDialogElement|null>(null)
const title=ref(''),content=ref(''),postCategory=ref<Category>('作品讨论'),spoiler=ref(false),workId=ref<number|null>(null),assetIds=ref<string[]>([])
const works=ref<Work[]>([]),uploading=ref(false),publishing=ref(false),loading=ref(false),error=ref(''),draftStatus=ref('')
let timer:ReturnType<typeof setTimeout>|undefined,pendingSave:Promise<void>|null=null
const payload=()=>({title:title.value,content:content.value,category:postCategory.value,spoiler:spoiler.value,workId:workId.value,assetIds:[...assetIds.value]})
function reset(){title.value='';content.value='';spoiler.value=false;assetIds.value=[];workId.value=null;postCategory.value='作品讨论'}
async function saveDraft(){
 clearTimeout(timer);if(!auth.user.value||loading.value||publishing.value)return
 if(pendingSave){await pendingSave;return saveDraft()}
 draftStatus.value='正在保存草稿…'
 const data=payload(),id=auth.user.value.id
 pendingSave=(async()=>{try{await auth.request('/forum/draft',data,'PUT');if(auth.user.value?.id===id)draftStatus.value='草稿已保存到当前账号'}catch(e){if(auth.user.value?.id===id)draftStatus.value='草稿未保存：'+(e as Error).message}finally{pendingSave=null}})()
 await pendingSave
}
async function discard(){clearTimeout(timer);if(pendingSave)await pendingSave;loading.value=true;try{await auth.request('/forum/draft',{},'DELETE');reset();draftStatus.value='草稿已清除'}catch(e){error.value=(e as Error).message}finally{loading.value=false}}
watch([title,content,postCategory,spoiler,workId,assetIds],()=>{if(loading.value||publishing.value||!composerOpen.value)return;clearTimeout(timer);draftStatus.value='有尚未保存的修改';timer=setTimeout(saveDraft,2000)},{deep:true,flush:'sync'})
watch(composerOpen,async open=>{
 if(!open){composeDialog.value?.close();if(!publishing.value)await saveDraft();return}
 await auth.initialize();if(!composerOpen.value)return;if(!auth.user.value){composerOpen.value=false;loginOpen.value=true;return}
 error.value='';loading.value=true;composeDialog.value?.showModal();const actorId=auth.user.value.id
 try{const [response,list]=await Promise.all([auth.request<{draft:{data:ReturnType<typeof payload>}|null}>('/forum/draft'),auth.request<Work[]>('/works')]);if(auth.user.value?.id!==actorId)return;works.value=list;reset();const draft=response.draft;if(draft){title.value=draft.data.title;content.value=draft.data.content;postCategory.value=draft.data.category;spoiler.value=draft.data.spoiler;workId.value=draft.data.workId;assetIds.value=draft.data.assetIds;draftStatus.value='已恢复当前账号的草稿'}else draftStatus.value='输入后自动保存草稿';if(composerWorkId.value){workId.value=composerWorkId.value;composerWorkId.value=null}}catch(e){error.value=(e as Error).message}finally{loading.value=false}
})
watch(loginOpen,open=>{if(open)loginDialog.value?.showModal();else loginDialog.value?.close()})
watch(()=>auth.user.value?.id,(id,previous)=>{if(!previous||id===previous)return;clearTimeout(timer);loading.value=true;reset();loading.value=false;draftStatus.value='';error.value='';composerOpen.value=false})
onBeforeUnmount(()=>clearTimeout(timer))
async function submitPost(){
 if(publishing.value||uploading.value)return
 if(title.value.trim().length<4||content.value.trim().length<10){error.value='标题至少 4 字，正文至少 10 字。';return}
 clearTimeout(timer);if(pendingSave)await pendingSave;publishing.value=true;error.value=''
 try{const id=await createPost(title.value,content.value,postCategory.value,spoiler.value,undefined,{format:'markdown',assetIds:assetIds.value,workId:workId.value});reset();draftStatus.value='';await navigateTo('/post/'+id)}catch(e){error.value=(e as Error).message}finally{publishing.value=false}
}
</script>
<template>
 <dialog ref="composeDialog" class="modal compose-modal" aria-labelledby="compose-title" @close="composerOpen=false">
  <div class="modal-heading"><div><p class="eyebrow">LET YOUR STORY RESONATE</p><h2 id="compose-title">把你的故事，留在这里。</h2></div><button type="button" class="icon-button" aria-label="关闭发帖窗口" :disabled="publishing||uploading" @click="composerOpen=false"><AppIcon name="close" /></button></div>
  <form class="compose-form" @submit.prevent="submitPost"><fieldset class="plain-fieldset" :disabled="publishing||loading">
   <div class="form-line"><label>发布到<select v-model="postCategory"><option v-for="item in categories" :key="item.name">{{ item.name }}</option></select></label><label class="spoiler-checkbox"><input v-model="spoiler" type="checkbox" />整篇包含剧透</label></div>
   <label class="community-field">关联作品<select v-model="workId"><option :value="null">不关联作品</option><option v-for="item in works" :key="item.rank" :value="item.rank">{{ item.title }}</option></select></label>
   <label class="sr-only" for="post-title">帖子标题</label><input id="post-title" v-model="title" class="compose-title-input" required minlength="4" maxlength="80" placeholder="一个值得点开的标题……" />
   <MarkdownEditor v-model="content" :asset-ids="assetIds" :disabled="publishing||loading" @assets="assetIds=$event" @busy="uploading=$event" />
   <p v-if="error" class="form-error" role="alert">{{ error }}</p><div class="draft-status" role="status"><span>{{ draftStatus }}</span><button type="button" :disabled="uploading" @click="saveDraft">保存草稿</button><button type="button" :disabled="uploading" @click="discard">清除草稿</button></div>
   <div class="compose-bottom"><p>请标记剧透，尊重彼此的阅读体验。</p><button type="submit" class="button primary" :disabled="uploading||publishing">{{ publishing?'发布中…':'发布帖子' }}<AppIcon name="send" :size="16" /></button></div>
  </fieldset></form>
 </dialog>
 <dialog ref="loginDialog" class="modal login-modal" aria-label="账号与登录" @close="loginOpen=false"><button class="icon-button modal-close" aria-label="关闭登录窗口" @click="loginOpen=false"><AppIcon name="close" /></button><AuthPanel /></dialog>
</template>
