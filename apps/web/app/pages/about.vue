<script setup lang="ts">
import { clubPromotion } from '~/data/club'
const { composerOpen } = useForum()
const {settings}=useSiteSettings()
const supplementalJoinInfo=computed(()=>settings.value.joinInfo.trim()==='入社方式与活动安排待管理员公布。'?'':settings.value.joinInfo)
useSeoMeta({ title: '关于澄之响 · 南京工程学院视觉小说同好会' })
</script>

<template>
  <div class="about-page"><p class="page-kicker"><span class="category-dot orange"></span> ABOUT OUR LITTLE CLUB</p><section class="about-hero"><img class="about-club-logo" :src="clubPromotion.logo" alt="澄之响视觉小说同好会 Logo" width="896" height="896" decoding="async" /><p class="eyebrow">南京工程学院 · 视觉小说同好会</p><h1>因为喜欢故事，<br>所以<span>在这里相遇。</span></h1><p>这里是澄之响。<br>一个可以认真聊作品，也可以轻松聊日常的地方。</p><a href="#join-club" class="button primary">加入 QQ 交流群<AppIcon name="users" :size="17" /></a><span class="about-hero-spark" aria-hidden="true">✳</span></section><div class="about-content"><div><span class="section-number">01 / WHO WE ARE</span><h2>故事读完了，<br>话还想说。</h2></div><div><p>我们是南京工程学院的视觉小说同好会。喜欢那些用文字、画面和音乐共同讲述的故事，也珍惜通关后仍然想与人分享的心情。</p><p>在这里，交换作品推荐，写下阅读手记，聊聊人物与音乐，也把一次次社团活动的记忆留下。</p><p>不需要很长的游玩清单。刚读完第一部也好，已经走过许多条故事线也好，带着你的喜欢来就好。</p></div></div><div class="about-values"><article><AppIcon name="book" :size="25" /><h3>认真聊作品</h3><p>每一种阅读感受，都值得被听见。</p></article><article><AppIcon name="leaf" :size="25" /><h3>温柔地表达</h3><p>标记剧透，尊重彼此，也保留不同。</p></article><article><AppIcon name="users" :size="25" /><h3>让喜欢相遇</h3><p>从第一句分享，认识屏幕另一端的你。</p></article></div><section class="about-join"><span class="eyebrow">THE NEXT CHAPTER, WITH YOU</span><h2>下一章，<br>留个位置给你。</h2><p>给大家推荐一部作品，或分享你的入坑故事。</p><button class="button primary" @click="composerOpen = true">向同好打个招呼<AppIcon name="pen" :size="16" /></button></section><ClubPromotion id="join-club" /><section v-if="supplementalJoinInfo||settings.contact||settings.links.length" class="experience-card"><h2>入社补充与联系方式</h2><p v-if="supplementalJoinInfo" class="entry-copy">{{ supplementalJoinInfo }}</p><p v-if="settings.contact">联系方式：{{ settings.contact }}</p><nav v-if="settings.links.length" class="friend-links" aria-label="友情链接"><a v-for="link in settings.links" :key="link.url" :href="link.url" target="_blank" rel="noopener noreferrer">{{ link.name }}<AppIcon name="arrowUpRight" :size="14" /></a></nav><NuxtLink to="/community" class="text-link">看看我们的活动与相册</NuxtLink></section><p class="page-footnote">澄之响视觉小说同好会 · 非学校官方网站。</p></div>
</template>

<style scoped>.about-club-logo { display: block; width: 6.5rem; height: auto; object-fit: contain; margin-bottom: 1.5rem; }</style>
