<script setup lang="ts">
import { works } from '~/data/forum'
const { composerOpen, username } = useForum()
const {topics,error,loading,load}=useTopics()
let timer:ReturnType<typeof setInterval>|undefined
function refreshTopics(){if(document.visibilityState==='visible')void load()}
onMounted(()=>{void load();timer=setInterval(refreshTopics,30000);window.addEventListener('focus',refreshTopics);document.addEventListener('visibilitychange',refreshTopics)})
onBeforeUnmount(()=>{clearInterval(timer);window.removeEventListener('focus',refreshTopics);document.removeEventListener('visibilitychange',refreshTopics)})
</script>

<template>
  <aside class="community-rail" aria-label="社区看板">
    <section class="rail-card welcome-card"><div class="welcome-decoration" aria-hidden="true"><DecorativeSpark /></div><span class="small-kicker"><span class="status-dot"></span>我们的小小据点</span><h2>{{ username ? `你好，${username}` : '欢迎来到澄之响' }}<span>。</span></h2><p>不必有很长的游玩清单。<br>带着喜欢的故事，来坐坐就好。</p><button class="button primary full" @click="composerOpen = true"><AppIcon name="plus" :size="17" />写下第一声回响</button><div class="community-numbers"><div><strong>12</strong><span>橙器作品</span></div><div><strong>04</strong><span>讨论分区</span></div><div><strong>∞</strong><span>故事回响</span></div></div></section>
    <ClubPromotion compact />
    <section class="rail-card reading-card"><div class="rail-heading"><h2><AppIcon name="book" :size="16" />从这一部开始</h2><NuxtLink to="/works" aria-label="查看全部作品"><AppIcon name="arrowUpRight" :size="16" /></NuxtLink></div><NuxtLink v-for="work in [works[2]!, works[0]!, works[9]!]" :key="work.rank" :to="`/works/${work.rank}`" class="reading-item"><WorkCover :rank="work.rank" variant="rail" :alt="`${work.title}封面`" /><div><strong>{{ work.title }}</strong><span>{{ work.studio }}</span><small>同好会成员推荐 <AppIcon name="arrowRight" :size="12" /></small></div></NuxtLink></section>
    <section class="rail-card topics-card"><div class="rail-heading"><h2><AppIcon name="hash" :size="16" />正在回响的话题</h2></div><NuxtLink v-for="topic in topics.slice(0,8)" :key="topic.name" :to="{path:'/',query:{tag:topic.name},hash:'#discussions'}"><span># {{ topic.name }}</span><small>{{ topic.count }} 篇</small><AppIcon name="arrowUpRight" :size="13" /></NuxtLink><p v-if="error" class="muted" role="status">话题暂时无法加载。<button class="text-link" :disabled="loading" @click="load">重试</button></p><p v-else-if="!topics.length" class="muted">{{ loading?'正在加载话题…':'还没有话题，写下第一声回响吧。' }}</p></section>
    <div class="rail-note"><AppIcon name="quote" :size="25" /><p>有些故事，<br>有人一起喜欢就很好。</p><span>WORDS FROM OUR LITTLE CLUB</span></div>
  </aside>
</template>
