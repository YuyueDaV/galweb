<script setup lang="ts">
const content=defineModel<string>({default:''})
const props=withDefaults(defineProps<{disabled?:boolean;assetIds?:string[]}>(),{assetIds:()=>[]})
const emit=defineEmits<{assets:[ids:string[]];busy:[value:boolean]}>()
const auth=useAuth(),textarea=ref<HTMLTextAreaElement|null>(null),input=ref<HTMLInputElement|null>(null),preview=ref(false),uploading=ref(false),error=ref('')
function removeImage(id:string){content.value=content.value.replace(new RegExp('!\\[[^\\]]*\\]\\(/api/assets/'+id+'\\)','g'),'');emit('assets',props.assetIds.filter(item=>item!==id))}
function insert(before:string,after='',placeholder='在这里写下内容'){
 const node=textarea.value,start=node?.selectionStart??content.value.length,end=node?.selectionEnd??start,selection=content.value.slice(start,end)||placeholder
 const next=content.value.slice(0,start)+before+selection+after+content.value.slice(end)
 if(next.length>10000){error.value='正文最多 10000 字符。';return}
 content.value=next;preview.value=false;nextTick(()=>{textarea.value?.focus();textarea.value?.setSelectionRange(start+before.length,start+before.length+selection.length)})
}
async function upload(event:Event){
 const node=event.target as HTMLInputElement,files=Array.from(node.files||[]);node.value='';if(!files.length||props.disabled||uploading.value)return
 error.value='';uploading.value=true;emit('busy',true)
 const ids=[...props.assetIds]
 try{if(!auth.user.value)throw new Error('请先登录再上传图片。');if(ids.length+files.length>12)throw new Error('每篇帖子最多 12 张图片。')
  for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 图片。');if(file.size>5*1024*1024)throw new Error('每张图片不能超过 5 MB。');const form=new FormData();form.append('file',file);const asset=await auth.request<{id:string,url:string}>('/uploads',form);ids.push(asset.id);emit('assets',[...ids])}
 }catch(e){error.value=(e as Error).message}finally{uploading.value=false;emit('busy',false)}
}
</script>
<template><div class="markdown-editor"><div class="editor-toolbar" role="toolbar" aria-label="正文格式"><button type="button" :disabled="disabled||uploading" @click="insert('## ','\n','章节标题')">标题</button><button type="button" :disabled="disabled||uploading" @click="insert('**','**')"><b>加粗</b></button><button type="button" :disabled="disabled||uploading" @click="insert('> ','\n','引用内容')">引用</button><button type="button" :disabled="disabled||uploading" @click="insert('- ','\n','列表内容')">列表</button><button type="button" :disabled="disabled||uploading" @click="insert('||','||','这段话包含剧透')">文字剧透</button><button type="button" :disabled="disabled||uploading" @click="insert('\n:::spoiler\n','\n:::\n','把剧透文字或图片放在这里')">折叠剧透区</button><button class="editor-add-image" type="button" :disabled="disabled||uploading" @click="input?.click()"><AppIcon name="plus" :size="16" />{{ uploading?'上传中…':'添加图片' }}</button><button type="button" :aria-pressed="preview" @click="preview=!preview">{{ preview?'继续编辑':'预览' }}</button></div><input ref="input" type="file" hidden multiple accept="image/jpeg,image/png,image/webp" :disabled="disabled||uploading" @change="upload" /><MarkdownContent v-if="preview" :source="content||'正文预览将显示在这里。'" class="editor-preview" /><PostAttachments v-if="preview" :source="content" :asset-ids="assetIds" /><textarea v-else ref="textarea" v-model="content" :disabled="disabled" maxlength="10000" rows="12" aria-label="帖子正文" placeholder="写下正文，支持 Markdown。选中文字后，可使用上方工具栏标记剧透。"></textarea><div v-if="assetIds.length" class="editor-attachments" aria-label="已上传配图"><div v-for="id in assetIds" :key="id"><img :src="'/api/assets/'+id" alt="已上传的配图" /><button type="button" :disabled="disabled||uploading" @click="insert('\n\n![图片](/api/assets/'+id+')\n\n','','')">插入正文</button><button type="button" :disabled="disabled||uploading" @click="removeImage(id)">移除图片</button></div></div><div class="editor-foot"><span>配图随帖子保存；可插入正文排版 · 每张最大 5 MB · 最多 12 张</span><span>{{ content.length }} / 10000</span></div><p v-if="error" class="form-error" role="alert">{{ error }}</p></div></template>
