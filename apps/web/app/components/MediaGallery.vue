<script setup lang="ts">
defineProps<{assetIds:string[];label?:string}>()
const active=ref(''),dialog=ref<HTMLDialogElement|null>(null)
function show(id:string){active.value=id;dialog.value?.showModal()}
</script>
<template><div class="media-gallery"><button v-for="(id,index) in assetIds" :key="id" type="button" :aria-label="`放大${label||'图片'} ${index+1}`" @click="show(id)"><SafeImage :src="'/api/assets/'+id" :alt="`${label||'图片'} ${index+1}`" loading="lazy" /></button></div><dialog ref="dialog" class="image-lightbox" aria-label="相册大图" @click="dialog?.close()" @close="active=''"><button type="button" aria-label="关闭大图" @click="dialog?.close()">关闭 ×</button><SafeImage v-if="active" :src="'/api/assets/'+active" :alt="label||'相册图片'" /></dialog></template>
