<script setup lang="ts">
import { works, coverUrl } from '~/data/forum'
useSeoMeta({ title: '第一届十二橙器 · 澄之响' })
</script>

<template>
  <div class="ranking-page">
    <div class="award-archive-strip"><span><AppIcon name="trophy" :size="16" />第一届 · 已公布的评选档案</span><NuxtLink to="/awards">前往新一届十二橙器<AppIcon name="arrowUpRight" :size="15" /></NuxtLink></div>
    <header class="ranking-hero"><div class="ranking-grid-art" aria-hidden="true"></div><p class="eyebrow">THE FIRST CHENG ZHI XIANG AWARDS</p><span class="ranking-top-note">由热爱提名，为感动加冕。</span><h1>十二<span class="orange-fruit">橙<svg viewBox="0 0 45 27" aria-hidden="true"><path d="M5 23C6 7 22 2 40 4 39 18 24 26 5 23Z" fill="currentColor"/></svg></span>器<span class="ranking-star" aria-hidden="true"><DecorativeSpark /></span></h1><p class="ranking-subtitle">十二部作品，十二种难以忘记的感动。</p><p class="ranking-description">第一届澄之响 Galgame 评选 · 同好会成员共同推荐</p><div class="ranking-hero-bottom"><span>南京工程学院 · 澄之响视觉小说同好会</span><span>VOL. 01 / OUR COLLECTIVE MEMORY</span></div></header>
    <div class="ranking-intro"><div><p class="eyebrow">A BOOKSHELF MADE BY US</p><h2>因为有人喜欢，所以值得被看见。</h2></div><p>每一段推荐词背后，都是一次认真读完的旅程。<br>这份名单来自原有评选项目，也欢迎你写下自己的答案。</p></div>
    <div class="ranking-top-three"><NuxtLink v-for="work in works.slice(0, 3)" :key="work.rank" :to="`/works/${work.rank}`" class="rank-feature"><div class="rank-feature-cover"><img :src="coverUrl(work.rank)" :alt="`${work.title}封面`" /><span class="rank-feature-number">{{ String(work.rank).padStart(2, '0') }}<small>/ 12</small></span><span class="rank-feature-badge"><AppIcon name="trophy" :size="13" />{{ ['共同的选择', '善恶的叩问', '魔法的回响'][work.rank - 1] }}</span></div><div class="rank-feature-body"><span>{{ work.subtitle }}</span><h3>{{ work.title }}<AppIcon name="arrowUpRight" :size="20" /></h3><p>{{ work.description }}</p><small>提名 / {{ work.nominator }}</small></div></NuxtLink></div>
    <div class="ranking-rest"><NuxtLink v-for="work in works.slice(3)" :key="work.rank" :to="`/works/${work.rank}`" class="rank-row"><span class="rank-row-number">{{ String(work.rank).padStart(2, '0') }}</span><span class="rank-row-cover"><img :src="coverUrl(work.rank)" :alt="`${work.title}封面`" loading="lazy" /></span><div class="rank-row-copy"><h3>{{ work.title }}</h3><p>{{ work.studio }}</p></div><span class="rank-row-nominator">提名 / {{ work.nominator }}</span><AppIcon name="arrowUpRight" :size="18" /></NuxtLink></div>
    <div class="ranking-afterword"><span aria-hidden="true"><DecorativeSpark /></span><h2>你的喜欢，也有它的位置。</h2><p>书单之外，还有无数值得相遇的故事。</p><NuxtLink to="/post/orange-awards" class="button primary">参与十二橙器讨论<AppIcon name="arrowUpRight" :size="16" /></NuxtLink></div>
  </div>
</template>
