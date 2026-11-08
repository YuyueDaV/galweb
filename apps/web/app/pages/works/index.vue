<script setup lang="ts">
import type { Work } from '~/types/forum'
const auth = useAuth()
const api = useRequestFetch()
const { data, error, refresh } = await useAsyncData('work-catalog', () => api<Work[]>('/api/works'))
const works = computed(() => data.value || [])
const search = ref('')
const order = ref('rank')
const shelfView = ref('cards')
const filteredWorks = computed(() => {
  const term = search.value.trim().toLowerCase()
  const list = works.value.filter(work => `${work.title} ${work.subtitle} ${work.studio} ${work.bangumi?.tags.join(' ') || ''}`.toLowerCase().includes(term))
  return order.value === 'name' ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')) : order.value === 'score' ? [...list].sort((a,b) => (b.bangumi?.score || 0) - (a.bangumi?.score || 0)) : list
})
useSeoMeta({ title: '作品书架 · 澄之响' })
</script>

<template>
  <div class="library-page">
    <div class="page-kicker"><span class="category-dot orange"></span> OUR SHARED BOOKSHELF <span>{{ works.length }} STORIES, COUNTLESS MEMORIES</span></div>
    <header class="subpage-hero"><div><h1>下一部故事，<br>从这里<span>翻开。</span></h1><p>从成员共同推荐的十二部视觉小说开始，<br>寻找下一次心动，也遇见有相同感动的人。</p></div><div class="shelf-illustration" aria-hidden="true"><WorkCover :rank="3" variant="cover" alt="" loading="eager" sizes="(max-width: 875px) 120px, 200px" /><WorkCover :rank="1" variant="cover" alt="" loading="eager" sizes="(max-width: 875px) 120px, 200px" /><WorkCover :rank="5" variant="cover" alt="" loading="eager" sizes="(max-width: 875px) 120px, 200px" /><span>the next chapter ↗</span></div></header>
    <div class="catalog-actions"><NuxtLink to="/tiers" class="button secondary">同好会 Tier 榜单 ↗</NuxtLink><NuxtLink v-if="auth.user.value && auth.user.value.role!=='member'" to="/admin/works" class="text-link">管理书库</NuxtLink></div><p v-if="error" class="form-error" role="alert">书库暂时未能加载。<button @click="refresh()">重试加载</button></p><BangumiSearch :works="works" @imported="refresh()" /><div class="library-toolbar"><h2>同好会的共同书单 <span>{{ filteredWorks.length }}</span></h2><div><label class="library-search"><AppIcon name="search" :size="16" /><input v-model="search" placeholder="搜索作品、制作组……" aria-label="搜索作品" /></label><label class="feed-sort"><span class="sr-only">作品排序</span><select v-model="order"><option value="rank">按收录顺序</option><option value="score">按 Bangumi 评分</option><option value="name">按作品名称</option></select></label></div></div>
    <div class="shelf-view-switch" role="group" aria-label="书架展示方式"><button type="button" :aria-pressed="shelfView==='cards'" @click="shelfView='cards'">卡片列表</button><button type="button" :aria-pressed="shelfView==='shelf'" @click="shelfView='shelf'">立体书架</button></div>
    <NuxtErrorBoundary v-if="shelfView==='shelf'"><Suspense><LazyBookShelf :works="filteredWorks" /><template #fallback><p class="shelf-loading" role="status">正在打开书架…</p></template></Suspense><template #error><div class="shelf-loading" role="alert"><p>立体书架暂时未能加载，可以继续浏览卡片列表。</p><button type="button" class="button secondary" @click="shelfView='cards'">返回卡片列表</button></div></template></NuxtErrorBoundary>
    <div v-else class="works-grid"><NuxtLink v-for="work in filteredWorks" :key="work.rank" :to="`/works/${work.rank}`" class="work-card"><div class="work-cover"><WorkCover :rank="work.rank" :src="work.rank>12 ? work.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined" variant="cover" :alt="`${work.title}封面`" /><span class="work-rank">{{ work.archiveRank ? String(work.archiveRank).padStart(2, '0') : 'BGM' }}<span>{{ work.archiveRank ? '十二橙器' : '书库收录' }}</span></span><span class="work-cover-arrow"><AppIcon name="arrowUpRight" :size="20" /></span></div><div class="work-card-copy"><p>{{ work.studio }}</p><h3>{{ work.title }}</h3><span>{{ work.description }}</span><div><span>{{ work.bangumi?.score ? `Bangumi ${work.bangumi.score.toFixed(1)}` : '成员推荐' }}</span><AppIcon name="arrowRight" :size="16" /></div></div></NuxtLink></div>
    <div v-if="!filteredWorks.length" class="empty-state"><AppIcon name="search" :size="30" /><h3>书架上还没有找到这部作品</h3><p>试试作品的中文名、英文名或制作组。</p><button class="button secondary" @click="search = ''">查看全部作品</button></div>
    <p class="page-footnote">本书库收录同好会推荐作品，保留历届十二橙器档案；Bangumi 评分为外部平台数据。封面及宣传图版权归各作品权利人所有。排名代表当届成员票选，每一种喜欢都值得被珍惜。</p>
  </div>
</template>
