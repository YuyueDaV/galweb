<script setup lang="ts">
import { works, coverUrl } from '~/data/forum'
const route = useRoute()
const { posts, composerOpen } = useForum()
const work = computed(() => works.find(item => String(item.rank) === route.params.id))
const related = computed(() => work.value ? posts.value.filter(post => post.image === work.value!.rank || post.tags.includes(work.value!.title)) : [])
useSeoMeta({ title: () => `${work.value?.title || '未找到作品'} · 澄之响作品书架` })
</script>

<template>
  <div v-if="work" class="work-detail-page">
    <NuxtLink to="/works" class="back-link"><AppIcon name="arrowLeft" :size="16" />回到作品书架</NuxtLink>
    <section class="work-detail-hero"><div class="work-detail-cover"><img :src="coverUrl(work.rank)" :alt="`${work.title}封面`" /></div><div class="work-detail-intro"><span class="rank-pill"><AppIcon name="trophy" :size="15" />十二橙器 · 第 {{ work.rank }} 名</span><p class="eyebrow">{{ work.subtitle }}</p><h1>{{ work.title }}</h1><p class="work-studio">{{ work.studio }}</p><p class="work-description">{{ work.description }}</p><div class="nominator"><span class="avatar-mini orange">澄</span><div><small>来自同好会的推荐</small><strong>{{ work.nominator }}</strong></div></div><button class="button primary" @click="composerOpen = true">聊聊这部作品<AppIcon name="comment" :size="17" /></button></div></section>
    <section class="work-discussions"><div class="section-heading"><div><p class="eyebrow">AFTER THE STORY</p><h2>读完之后，还有话想说<span class="heading-dot">。</span></h2></div></div><div v-if="related.length" class="post-list"><PostCard v-for="post in related" :key="post.id" :post="post" /></div><div v-else class="empty-state"><AppIcon name="comment" :size="30" /><h3>这部故事，还在等你的第一篇手记</h3><p>留下喜欢的理由，也给下一位读者一点期待。</p><button class="button secondary" @click="composerOpen = true">发起作品讨论<AppIcon name="pen" :size="15" /></button></div></section>
    <NuxtLink to="/ranking" class="text-link">翻开完整的十二橙器书单<AppIcon name="arrowRight" :size="16" /></NuxtLink>
  </div>
  <div v-else class="empty-state"><AppIcon name="book" :size="36" /><h1>这页故事还没有被写下</h1><NuxtLink to="/works" class="button primary">回到作品书架</NuxtLink></div>
</template>
