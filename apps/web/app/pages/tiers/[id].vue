<script setup lang="ts">
import type { TierList } from '~/types/catalog'
import type { Work } from '~/types/forum'
const route = useRoute(),
  api = useRequestFetch()
const {
  data: list,
  error,
  refresh,
} = await useAsyncData(
  () => 'public-tier:' + route.params.id,
  () => api<TierList>('/api/tier-lists/' + encodeURIComponent(String(route.params.id))),
)
if (error.value)
  throw createError({
    statusCode: error.value.statusCode || 503,
    statusMessage: error.value.statusCode === 404 ? '榜单不存在或尚未发布' : '榜单暂时不可用',
  })
const { data: works } = await useAsyncData('work-catalog', () => api<Work[]>('/api/works'))
useSeoMeta({ title: () => (list.value?.title || 'Tier 榜单') + ' · 澄之响' })
</script>
<template>
  <div v-if="list" class="experience-page">
    <NuxtLink to="/tiers" class="back-link">← 全部 Tier 榜单</NuxtLink>
    <header class="experience-heading">
      <div>
        <p class="eyebrow">A TIER LIST WE BUILD TOGETHER</p>
        <h1>{{ list.title }}</h1>
        <p>{{ list.description }}</p>
        <NuxtLink v-if="list.author" :to="'/user/' + list.author.id" class="tier-author"
          ><UserAvatar :src="list.author.avatarUrl" :name="list.author.name" />{{
            list.author.name
          }}的个人榜单</NuxtLink
        >
      </div>
    </header>
    <TierBoard v-if="list.mode === 'personal'" :list="list" :works="list.works || works || []" />
    <TierVotingPanel v-else :list="list" :works="list.works || works || []" @updated="refresh()" />
    <p class="page-footnote">作品封面及外部资料归相应权利人所有。Bangumi 评分与本站分层人数统计独立。</p>
  </div>
</template>
