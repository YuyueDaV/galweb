<script setup lang="ts">
import type {LibraryItem} from '~/types/community'
const auth=useAuth(),{loginOpen}=useForum(),items=ref<LibraryItem[]>([]),error=ref(''),states={wish:'想读',reading:'在读',finished:'已读'}
async function load(){await auth.initialize();if(!auth.user.value){items.value=[];return}try{items.value=await auth.request('/library')}catch(e){error.value=(e as Error).message}}
onMounted(load);watch(()=>auth.user.value?.id,load)
useSeoMeta({title:'我的书单 · 澄之响',robots:'noindex,nofollow'})
</script>
<template><div class="experience-page"><header class="experience-heading"><div><p class="eyebrow">MY READING JOURNEY</p><h1>我的书单<span>。</span></h1><p>想读、在读、已读，把每一段旅程留下。</p></div><NuxtLink to="/works">去作品书架</NuxtLink></header><p v-if="error" class="form-error" role="alert">{{ error }}</p><div v-if="auth.user.value" class="member-library"><article v-for="item in items" :key="item.workId" class="experience-card"><span class="small-kicker">{{ states[item.state] }} · {{ item.isPublic?'公开':'仅本人可见' }}</span><h2><NuxtLink :to="'/works/'+item.workId">{{ item.work.title }}</NuxtLink></h2><p class="entry-copy">{{ item.note||'暂未留下短评。' }}</p><NuxtLink :to="'/works/'+item.workId" class="text-link">修改阅读记录</NuxtLink></article><div v-if="!items.length" class="empty-state">书单还是空的，从喜欢的一部作品开始。</div></div><button v-else class="button primary" @click="loginOpen=true">登录后查看书单</button></div></template>
