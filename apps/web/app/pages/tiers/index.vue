<script setup lang="ts">
import type { TierList } from '~/types/catalog'
const api = useRequestFetch()
const { data, error, refresh } = await useAsyncData('public-tier-lists', () =>
  api<TierList[]>('/api/tier-lists'),
)
const mode = ref('all')
const visible = computed(() =>
  (data.value || []).filter((list) => mode.value === 'all' || list.mode === mode.value),
)
useSeoMeta({ title: '同好会 Tier 榜单 · 澄之响' })
</script>
<template>
  <div class="experience-page">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">EVERY TASTE HAS A PLACE</p>
        <h1>同好会 Tier 榜单<span>。</span></h1>
        <p>为喜欢的作品选一层，看看同好们的选择。</p>
      </div>
      <NuxtLink to="/works">回到作品书架</NuxtLink>
    </header>
    <div class="catalog-actions">
      <NuxtLink to="/tiers/mine" class="button primary">制作我的个人 Tier 榜</NuxtLink
      ><button
        v-for="item in [
          { id: 'all', name: '全部榜单' },
          { id: 'community', name: '共同投票榜' },
          { id: 'personal', name: '用户个人榜' },
        ]"
        :key="item.id"
        class="button secondary"
        :aria-pressed="mode === item.id"
        @click="mode = item.id"
      >
        {{ item.name }}
      </button>
    </div>
    <p v-if="error" class="form-error" role="alert">榜单未能加载。<button @click="refresh()">重试</button></p>
    <div class="member-library">
      <NuxtLink v-for="list in visible" :key="list.id" :to="'/tiers/' + list.id" class="experience-card"
        ><h2>{{ list.title }}</h2>
        <p class="entry-copy">{{ list.description || '一份来自同好会的作品分层推荐。' }}</p>
        <p v-if="list.author" class="tier-author">
          <UserAvatar :src="list.author.avatarUrl" :name="list.author.name" />{{ list.author.name }}的个人选择
        </p>
        <span class="catalog-help"
          >{{ list.mode === 'personal' ? '个人榜单' : `${list.participants || 0} 人参与` }} ·
          {{ list.rows.length }} 个分层 ·
          {{ list.rows.reduce((total, row) => total + row.workIds.length, 0) }} 部作品 ↗</span
        ></NuxtLink
      >
    </div>
    <p v-if="!error && !visible.length" class="empty-state">暂时没有匹配的公开 Tier 榜单。</p>
  </div>
</template>
