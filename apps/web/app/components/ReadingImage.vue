<script setup lang="ts">
defineProps<{src:string;alt:string}>()
const dialog=ref<HTMLDialogElement|null>(null)
</script>
<template><button type="button" class="reading-image-button" :aria-label="'放大'+alt" @click="dialog?.showModal()"><SafeImage :src="src" :alt="alt" class="detail-cover" /></button><dialog ref="dialog" class="image-lightbox" :aria-label="alt" @click="dialog?.close()"><button type="button" aria-label="关闭大图" @click="dialog?.close()">关闭 ×</button><SafeImage :src="src" :alt="alt" /></dialog></template>
