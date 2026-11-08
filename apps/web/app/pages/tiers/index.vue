<script setup lang="ts">
import type { TierList } from '~/types/catalog'
const api = useRequestFetch()
const { data, error, refresh } = await useAsyncData('public-tier-lists', () =>
  api<TierList[]>('/api/tier-lists'),
)
useSeoMeta({ title: '同好会 Tier 榜单 · 澄之响' })
</script>
<template>
  <div class="experience-page">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">EVERY TASTE HAS A PLACE</p>
        <h1>同好会 Tier 榜单<span>。</span></h1>
        <p>从不同角度整理喜欢的作品，寻找下一部想读的故事。</p>
      </div>
      <NuxtLink to="/works">回到作品书架</NuxtLink>
    </header>
    <p v-if="error" class="form-error" role="alert">榜单未能加载。<button @click="refresh()">重试</button></p>
    <div class="member-library">
      <NuxtLink v-for="list in data" :key="list.id" :to="'/tiers/' + list.id" class="experience-card"
        ><h2>{{ list.title }}</h2>
        <p class="entry-copy">{{ list.description || '一份来自同好会的作品分层推荐。' }}</p>
        <span class="catalog-help"
          >{{ list.rows.length }} 个分层 ·
          {{ list.rows.reduce((total, row) => total + row.workIds.length, 0) }} 部作品 ↗</span
        ></NuxtLink
      >
    </div>
    <p v-if="!error && !data?.length" class="empty-state">
      暂时没有公开的 Tier 榜单，敬请期待管理员的下一份推荐。
    </p>
  </div>
</template>
