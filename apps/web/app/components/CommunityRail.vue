<script setup lang="ts">
import { works } from '~/data/forum'
const { composerOpen, username } = useForum()
</script>

<template>
  <aside class="community-rail" aria-label="社区看板">
    <section class="rail-card welcome-card"><div class="welcome-decoration" aria-hidden="true">✳</div><span class="small-kicker"><span class="status-dot"></span>我们的小小据点</span><h2>{{ username ? `你好，${username}` : '欢迎来到澄之响' }}<span>。</span></h2><p>不必有很长的游玩清单。<br>带着喜欢的故事，来坐坐就好。</p><button class="button primary full" @click="composerOpen = true"><AppIcon name="plus" :size="17" />写下第一声回响</button><div class="community-numbers"><div><strong>12</strong><span>橙器作品</span></div><div><strong>04</strong><span>讨论分区</span></div><div><strong>∞</strong><span>故事回响</span></div></div></section>
    <section class="rail-card reading-card"><div class="rail-heading"><h2><AppIcon name="book" :size="16" />从这一部开始</h2><NuxtLink to="/works" aria-label="查看全部作品"><AppIcon name="arrowUpRight" :size="16" /></NuxtLink></div><NuxtLink v-for="work in [works[2]!, works[0]!, works[9]!]" :key="work.rank" :to="`/works/${work.rank}`" class="reading-item"><WorkCover :rank="work.rank" variant="rail" :alt="`${work.title}封面`" /><div><strong>{{ work.title }}</strong><span>{{ work.studio }}</span><small>同好会成员推荐 <AppIcon name="arrowRight" :size="12" /></small></div></NuxtLink></section>
    <section class="rail-card topics-card"><div class="rail-heading"><h2><AppIcon name="hash" :size="16" />正在回响的话题</h2></div><NuxtLink v-for="(tag, index) in ['你的第一部视觉小说', '十二橙器', '无剧透推荐', '视觉小说里的音乐']" :key="tag" :to="{ path: '/', query: { q: ['入坑故事', '十二橙器', '无剧透', '音乐'][index] }, hash: '#discussions' }"><span># {{ tag }}</span><AppIcon name="arrowUpRight" :size="13" /></NuxtLink></section>
    <div class="rail-note"><AppIcon name="quote" :size="25" /><p>有些故事，<br>有人一起喜欢就很好。</p><span>WORDS FROM OUR LITTLE CLUB</span></div>
  </aside>
</template>
