<script setup lang="ts">
import type { Category } from '~/types/forum'
import { categories } from '~/data/forum'
const { composerOpen, loginOpen, createPost, username } = useForum()
const composeDialog = ref<HTMLDialogElement | null>(null)
const loginDialog = ref<HTMLDialogElement | null>(null)
const title = ref('')
const content = ref('')
const postCategory = ref<Category>('作品讨论')
const spoiler = ref(false)
const assetId=ref(''),uploading=ref(false)
const imageInput=ref<HTMLInputElement|null>(null)
const imageName=ref('')
const auth=useAuth()
const error = ref('')
watch(composerOpen, open => {
  if (open) { error.value = ''; composeDialog.value?.showModal() }
  else composeDialog.value?.close()
})
watch(loginOpen, open => {
  if (open) { loginDialog.value?.showModal() }
  else loginDialog.value?.close()
})
function backdropClose(event: MouseEvent, dialog: HTMLDialogElement | null, close: () => void) {
  if (event.target !== dialog || !dialog) return
  const rect = dialog.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
async function submitPost() {
  if (title.value.trim().length < 4) { error.value = '给这篇帖子取个至少 4 个字的标题吧。'; return }
  if (content.value.trim().length < 10) { error.value = '再多写一点吧，正文至少需要 10 个字。'; return }
  try {
  const id = await createPost(title.value, content.value, postCategory.value, spoiler.value,assetId.value||undefined)
  title.value = ''; content.value = ''; spoiler.value = false;removeImage()
  await navigateTo(`/post/${id}`)
  } catch(cause) { error.value=(cause as Error).message }
}
function removeImage(){assetId.value='';imageName.value='';if(imageInput.value)imageInput.value.value=''}
async function upload(event:Event){
  const input=event.target as HTMLInputElement,file=input.files?.[0]
  if(!file)return
  error.value=''
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){error.value='请上传 JPG、PNG 或 WebP 图片。';input.value='';return}
  if(file.size>5*1024*1024){error.value='图片不能超过 5 MB。';input.value='';return}
  uploading.value=true
  try{const form=new FormData();form.append('file',file);assetId.value=(await auth.request<{id:string}>('/uploads',form)).id;imageName.value=file.name}
  catch(cause){error.value=(cause as Error).message}
  finally{uploading.value=false;input.value=''}
}
</script>

<template>
  <dialog ref="composeDialog" class="modal compose-modal" aria-labelledby="compose-title" @close="composerOpen = false" @click="backdropClose($event, composeDialog, () => composerOpen = false)">
    <div class="modal-heading"><div><p class="eyebrow">LET YOUR STORY RESONATE</p><h2 id="compose-title">把你的故事，留在这里。</h2></div><button class="icon-button" aria-label="关闭发帖窗口" @click="composerOpen = false"><AppIcon name="close" /></button></div>
    <form class="compose-form" @submit.prevent="submitPost">
      <div class="form-line"><label>发布到<select v-model="postCategory"><option v-for="item in categories" :key="item.name">{{ item.name }}</option></select></label><label class="spoiler-checkbox"><input v-model="spoiler" type="checkbox" /> 包含关键剧情剧透</label></div>
      <label class="sr-only" for="post-title">帖子标题</label><input id="post-title" v-model="title" class="compose-title-input" maxlength="80" placeholder="一个值得点开的标题……" />
      <label class="sr-only" for="post-content">帖子正文</label><textarea id="post-content" v-model="content" rows="9" maxlength="10000" placeholder="聊聊刚读完的故事、喜欢的角色，或是今天的一点小事。\n\n不同的感受，都值得被认真听见。"></textarea>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="compose-attachment">
        <span class="attachment-label">配图 <span>选填</span></span>
        <input ref="imageInput" type="file" hidden accept="image/jpeg,image/png,image/webp" :disabled="uploading" aria-label="选择帖子配图" @change="upload" />
        <div class="attachment-row">
          <button type="button" class="attachment-tile" :class="{'has-image':assetId}" :disabled="uploading" :aria-busy="uploading" :aria-label="assetId?'更换配图':'添加配图'" aria-describedby="attachment-help" @click="imageInput?.click()">
            <img v-if="assetId" :src="`/api/assets/${assetId}`" alt="已选择的帖子配图" />
            <template v-else><AppIcon name="plus" :size="28" /><span>{{ uploading?'上传中…':'添加图片' }}</span></template>
            <span v-if="assetId" class="attachment-change">{{ uploading?'上传中…':'更换图片' }}</span>
          </button>
          <div class="attachment-copy">
            <p v-if="assetId" class="attachment-filename">{{ imageName }}</p>
            <p id="attachment-help">JPG、PNG、WebP · 最大 5 MB</p>
            <button v-if="assetId" type="button" class="attachment-remove" :disabled="uploading" @click="removeImage">移除图片</button>
            <span class="sr-only" role="status">{{ uploading?'图片正在上传':assetId?'图片已上传':'' }}</span>
          </div>
        </div>
      </div>
      <div class="compose-bottom"><p><AppIcon name="info" :size="15" />请尊重同好，标记关键剧透。</p><button type="submit" class="button primary" :disabled="uploading"><AppIcon name="send" :size="16" />发布帖子</button></div>
    </form>
  </dialog>
  <dialog ref="loginDialog" class="modal login-modal" aria-label="账号与登录" @close="loginOpen = false"><button class="icon-button modal-close" aria-label="关闭登录窗口" @click="loginOpen = false"><AppIcon name="close" /></button><AuthPanel /></dialog>
</template>

<style scoped>
.compose-attachment{padding:.375rem 0 1.25rem}
.attachment-label{display:block;margin-bottom:.625rem;font-size:.6875rem;color:var(--ink)}
.attachment-label>span{margin-left:.375rem;font-size:.5625rem;color:var(--muted)}
.attachment-row{display:flex;align-items:center;gap:.875rem}
.attachment-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.375rem;flex-shrink:0;width:5.25rem;height:5.25rem;padding:0;border:1px dashed var(--line);border-radius:.5rem;background:var(--bg);color:var(--subtle);overflow:hidden;cursor:pointer;transition:border-color .18s,color .18s,background .18s}
.attachment-tile:not(:disabled):hover{border-color:var(--orange);color:var(--orange);background:var(--surface)}
.attachment-tile:focus-visible,.attachment-remove:focus-visible{outline:2px solid var(--orange);outline-offset:3px}
.attachment-tile>span{font-size:.5625rem}
.attachment-tile:disabled{cursor:wait;opacity:.6}
.attachment-tile.has-image{border-style:solid}
.attachment-tile>img{display:block;width:100%;height:100%;object-fit:contain}
.attachment-tile>.attachment-change{position:absolute;inset:auto 0 0;padding:.25rem;background:#30352ed9;color:#fff;text-align:center;font-size:.5rem}
.attachment-copy{min-width:0;font-size:.5625rem;color:var(--muted);line-height:1.8}
.attachment-filename{max-width:22rem;overflow-wrap:anywhere;color:var(--subtle);margin-bottom:.125rem}
.attachment-remove{margin-top:.25rem;padding:0;border:0;background:transparent;color:var(--orange);font:inherit;cursor:pointer}
.attachment-remove:disabled{cursor:wait;opacity:.6}
</style>
