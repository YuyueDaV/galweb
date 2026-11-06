<script setup lang="ts">
import {renderMarkdown} from '~/utils/markdown'
const props=defineProps<{source:string}>()
defineOptions({inheritAttrs:false})
const rendered=computed(()=>renderMarkdown(props.source))
const enlarged=ref(''),dialog=ref<HTMLDialogElement|null>(null)
function zoom(event:MouseEvent){const target=event.target;if(target instanceof HTMLImageElement&&target.hasAttribute('data-reading-image')){enlarged.value=target.src;dialog.value?.showModal()}}
function close(){dialog.value?.close();enlarged.value=''}
</script>
<template><div v-bind="$attrs" class="markdown-content" @click="zoom" v-html="rendered.html"></div><dialog ref="dialog" class="image-lightbox" aria-label="查看大图" @click="close" @close="enlarged=''"><button type="button" aria-label="关闭大图" @click="close">关闭 ×</button><img v-if="enlarged" :src="enlarged" alt="放大的帖子图片" /></dialog></template>
