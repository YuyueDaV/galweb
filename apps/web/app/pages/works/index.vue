<script setup lang="ts">
import { works, coverUrl } from '~/data/forum'
const search = ref('')
const order = ref('rank')
const filteredWorks = computed(() => {
  const term = search.value.trim().toLowerCase()
  const list = works.filter(work => `${work.title} ${work.subtitle} ${work.studio}`.toLowerCase().includes(term))
  return order.value === 'name' ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')) : list
})
useSeoMeta({ title: '作品书架 · 澄之响' })
</script>

<template>
  <div class="library-page">
    <div class="page-kicker"><span class="category-dot orange"></span> OUR SHARED BOOKSHELF <span>12 STORIES, COUNTLESS MEMORIES</span></div>
    <header class="subpage-hero"><div><h1>下一部故事，<br>从这里<span>翻开。</span></h1><p>从成员共同推荐的十二部视觉小说开始，<br>寻找下一次心动，也遇见有相同感动的人。</p></div><div class="shelf-illustration" aria-hidden="true"><img :src="coverUrl(3)" alt="" /><img :src="coverUrl(1)" alt="" /><img :src="coverUrl(5)" alt="" /><span>the next chapter ↗</span></div></header>
    <div class="library-toolbar"><h2>同好会的共同书单 <span>{{ filteredWorks.length }}</span></h2><div><label class="library-search"><AppIcon name="search" :size="16" /><input v-model="search" placeholder="搜索作品、制作组……" aria-label="搜索作品" /></label><label class="feed-sort"><span class="sr-only">作品排序</span><select v-model="order"><option value="rank">按橙器排名</option><option value="name">按作品名称</option></select></label></div></div>
    <div class="works-grid"><NuxtLink v-for="work in filteredWorks" :key="work.rank" :to="`/works/${work.rank}`" class="work-card"><div class="work-cover"><img :src="coverUrl(work.rank)" :alt="`${work.title}封面`" loading="lazy" /><span class="work-rank">{{ String(work.rank).padStart(2, '0') }}<span>十二橙器</span></span><span class="work-cover-arrow"><AppIcon name="arrowUpRight" :size="20" /></span></div><div class="work-card-copy"><p>{{ work.studio }}</p><h3>{{ work.title }}</h3><span>{{ work.description }}</span><div><span>成员推荐</span><AppIcon name="arrowRight" :size="16" /></div></div></NuxtLink></div>
    <div v-if="!filteredWorks.length" class="empty-state"><AppIcon name="search" :size="30" /><h3>书架上还没有找到这部作品</h3><p>试试作品的中文名、英文名或制作组。</p><button class="button secondary" @click="search = ''">查看全部作品</button></div>
    <p class="page-footnote">本书单与封面继承自澄之响「十二橙器」评选项目。排名代表当届成员票选，每一种喜欢都值得被珍惜。</p>
  </div>
</template>
