<script setup lang="ts">
import { categories } from '~/data/forum'
import type { Category } from '~/types/forum'
const route = useRoute()
const {settings}=useSiteSettings()
const { category, query, composerOpen,loadFeed,hasMore,feedPosts,feedTotal,loadingFeed,feedLoaded,feedError } = useForum()
const tab = ref('最新回响')
const sort = ref('latest')
const pending=ref(true)
const allowedCategories = categories.map(item => item.name)
watch(() => route.query, params => {
  category.value = typeof params.category === 'string' && allowedCategories.includes(params.category as Category) ? params.category as Category : '全部'
  if (typeof params.q === 'string') query.value = params.q
  if (params.saved) query.value = ''
  tab.value = '最新回响'
}, { immediate: true })
const visiblePosts=feedPosts
const options=computed(()=>({...query.value.trim()?{q:query.value.trim()}:{},...category.value!=='全部'?{category:category.value}:{},sort:sort.value,tab:tab.value==='精选好文'?'featured':tab.value==='等你回复'?'unanswered':'latest',...route.query.saved?{saved:'true'}:{}}))
function chooseCategory(value: Category | '全部') { category.value = value }
let feedTimer:ReturnType<typeof setTimeout>|undefined
let requestVersion=0
watch(options,()=>{clearTimeout(feedTimer);const version=++requestVersion,next={...options.value};pending.value=true;if(import.meta.client)feedTimer=setTimeout(async()=>{await loadFeed(next);if(version===requestVersion)pending.value=false},200)},{immediate:true})
onBeforeUnmount(()=>{clearTimeout(feedTimer);requestVersion++})
async function more(){if(!pending.value)await loadFeed(options.value,true)}
async function retry(){clearTimeout(feedTimer);const version=++requestVersion;pending.value=true;await loadFeed(options.value);if(version===requestVersion)pending.value=false}
useSeoMeta({ title:()=>settings.value.title+' · 澄之响',description:()=>settings.value.description })
</script>

<template>
  <div>
    <section class="home-hero" aria-labelledby="hero-title">
      <div class="hero-grid" aria-hidden="true"></div><div class="hero-copy"><p class="hero-kicker"><span class="small-spark">✳</span> NJIT · VISUAL NOVEL CLUB</p><h1 id="hero-title">故事之外，<br>总有新的<span class="hero-echo">回响<span class="title-spark" aria-hidden="true">✳</span></span>。</h1><p class="hero-description">{{ settings.title }}<br>{{ settings.description }}</p><div class="hero-links"><a href="#discussions" class="button hero-button">去听听大家的故事<AppIcon name="arrowUpRight" :size="17" /></a><NuxtLink to="/about" class="hero-about">认识澄之响<AppIcon name="arrowRight" :size="15" /></NuxtLink></div><div class="hero-caption"><span class="tiny-line"></span> FOR EVERY STORY, AND EVERY ONE OF YOU.</div></div>
      <div class="hero-art" aria-hidden="true"><div class="hero-orbit orbit-one"></div><div class="hero-orbit orbit-two"></div><div class="hero-sun"></div><div class="art-word">RESONATE</div><figure class="hero-polaroid"><div class="polaroid-top"><span>THE STORIES WE SHARE</span><span>NO. 001</span></div><WorkCover :rank="9" variant="hero" alt="" loading="eager" fetchpriority="high" /><figcaption><span>喜欢的故事，想和你一起聊。</span><span class="handwriting">with you.</span></figcaption></figure><div class="art-sticker sticker-top"><span>✳</span> 欢迎来到我们的故事</div><div class="art-sticker sticker-bottom"><span class="status-dot"></span>下一段故事，等你加入。</div><div class="art-cross">✳</div><span class="art-label">CHENG ZHI XIANG<br>EST. IN OUR STORIES</span></div>
    </section>

    <div v-if="settings.announcement" class="site-announcement" role="status"><AppIcon name="bell" :size="16" />{{ settings.announcement }}</div><div class="home-intro-line"><span><span class="status-dot"></span>一个属于视觉小说爱好者的温柔角落</span><span>HELLO, FELLOW READER <AppIcon name="leaf" :size="14" /></span></div>

    <div class="community-grid">
      <div class="feed-column">
        <section class="category-grid" aria-label="选择讨论分区"><button v-for="item in categories" :key="item.name" :class="['category-card', item.color, { active: category === item.name }]" :aria-pressed="category === item.name" @click="chooseCategory(category === item.name ? '全部' : item.name)"><span class="category-icon"><AppIcon :name="item.icon" :size="19" /></span><span><strong>{{ item.name }}</strong><small>{{ item.description }}</small></span><AppIcon name="arrowUpRight" :size="14" class="category-arrow" /></button></section>
        <section id="discussions" class="feed-section" aria-labelledby="feed-title">
          <div class="section-heading"><div><p class="eyebrow">OUR COMMUNITY</p><h2 id="feed-title">{{ route.query.saved ? '我的收藏' : '广场里的新鲜事' }}<span class="heading-dot">。</span></h2></div><button class="write-link" @click="composerOpen = true"><AppIcon name="pen" :size="15" />发起讨论</button></div>
          <div class="feed-toolbar"><div class="feed-tabs" role="group" aria-label="帖子类型"><button v-for="item in ['最新回响', '精选好文', '等你回复']" :key="item" :class="{ active: tab === item }" :aria-pressed="tab === item" @click="tab = item"><AppIcon v-if="item === '最新回响'" name="clock" :size="15" />{{ item }}</button></div><label class="feed-sort"><AppIcon name="filter" :size="14" /><span class="sr-only">帖子排序</span><select v-model="sort"><option value="latest">最新发布</option><option value="hot">最多回复</option></select></label></div>
          <div v-if="query || category !== '全部' || route.query.saved || tab !== '最新回响'" class="active-filters"><span v-if="query">搜索：{{ query }}</span><span v-if="category !== '全部'">{{ category }}</span><span v-if="tab !== '最新回响'">{{ tab }}</span><span>{{ pending||!feedLoaded?'正在查找…':`共 ${feedTotal} 篇帖子` }}</span><button @click="query = ''; category = '全部'; tab = '最新回响'; navigateTo('/#discussions')">清除筛选<AppIcon name="close" :size="13" /></button></div>
          <div v-if="pending||!feedLoaded" class="empty-state" role="status"><p>正在寻找新的回响…</p></div><div v-else-if="feedError&&!visiblePosts.length" class="empty-state" role="alert"><p>{{ feedError }}</p><button class="button secondary" @click="retry">重试加载</button></div><div v-else class="post-list"><PostCard v-for="post in visiblePosts" :key="post.id" :post="post" /><div v-if="!visiblePosts.length" class="empty-state"><AppIcon :name="route.query.saved ? 'bookmark' : 'comment'" :size="32" /><h3>{{ route.query.saved ? '把喜欢的故事收进来' : '这里还在等第一声回响' }}</h3><p>{{ route.query.saved ? '点击帖子旁的收藏图标，就能在这里找到它。' : '换个关键词，或者由你来开启这场讨论。' }}</p><button class="button secondary" @click="composerOpen = true">写一篇帖子<AppIcon name="plus" :size="15" /></button></div></div>
          <p v-if="feedError&&visiblePosts.length" class="form-error" role="alert">{{ feedError }}</p><button v-if="hasMore&&!pending" class="load-more" :disabled="loadingFeed" @click="more">{{ loadingFeed?'正在加载…':'再听听更多故事' }}<AppIcon name="chevronDown" :size="16" /></button><p v-else-if="visiblePosts.length&&!pending&&!loadingFeed" class="feed-end"><span></span>故事还在继续，等你写下下一页。<span></span></p>
        </section>
        <NuxtLink to="/awards" class="awards-banner"><div><span class="small-kicker">THE TWELVE ORANGES / VOL. 02</span><h2>新一届十二橙器，等你的喜欢。</h2><p>参与作品提名与投票，也可以重温第一届书单</p></div><span class="awards-banner-mark">12<span>✳</span></span><span class="round-arrow"><AppIcon name="arrowUpRight" :size="22" /></span></NuxtLink>
      </div>
      <CommunityRail />
    </div>
  </div>
</template>
