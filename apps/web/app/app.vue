<script setup lang="ts">
const forum = useForum()
const identity = usePreviewIdentity()
const auth=useAuth()
const route = useRoute()
const mobileOpen = ref(false)
const dark = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const searchExpanded = ref(false)
const { username, query, category, composerOpen, loginOpen, bookmarks, toast } = forum
const activeSection = computed(() => route.path.startsWith('/account') ? 'account' : route.path.startsWith('/admin') ? 'admin' : route.path.startsWith('/works') ? 'works' : route.path.startsWith('/ranking') || route.path.startsWith('/awards') ? 'ranking' : route.path.startsWith('/about') ? 'about' : 'home')
useHead({ htmlAttrs: { 'data-theme': computed(() => dark.value ? 'dark' : 'light') } })

onMounted(async () => {
  await auth.initialize()
  await Promise.all([forum.initialize(),identity.initialize()])
  try { dark.value = localStorage.getItem('chengzhixiang-theme') === 'dark' } catch {}
})
watch(identity.selectedId,async()=>{await forum.syncMine();await forum.loadFeed();await identity.refreshAccounts()})
watch(()=>auth.user.value?.id,async()=>{try{await forum.syncMine()}catch(e){forum.notify((e as Error).message)}})
watch(() => route.fullPath, () => { mobileOpen.value = false })
function toggleTheme() {
  dark.value = !dark.value
  try { localStorage.setItem('chengzhixiang-theme', dark.value ? 'dark' : 'light') } catch {}
}
async function search() {
  category.value = '全部'
  searchExpanded.value = false
  await navigateTo('/')
  nextTick(() => document.getElementById('discussions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}
function openSearch() {
  searchExpanded.value = true
  nextTick(() => searchInput.value?.focus())
}
function resetFeed() { query.value = ''; category.value = '全部' }
</script>

<template>
  <div class="site-wrap">
    <a class="skip-link" href="#main-content">跳转到正文</a>
    <header class="site-header">
      <div class="header-inner">
        <button class="icon-button mobile-toggle" :aria-expanded="mobileOpen" aria-controls="community-nav" aria-label="展开社区导航" @click="mobileOpen = !mobileOpen"><AppIcon :name="mobileOpen ? 'close' : 'menu'" /></button>
        <NuxtLink to="/" class="brand" aria-label="澄之响首页" @click="resetFeed"><ClubMark /><span class="brand-name">澄之响<span class="brand-english">CHENG ZHI XIANG</span></span><span class="brand-divider"></span><span class="brand-school">南京工程学院<br>视觉小说同好会</span></NuxtLink>
        <nav class="top-nav" aria-label="主导航">
          <NuxtLink to="/" :class="{ active: activeSection === 'home' }" @click="resetFeed">社区首页</NuxtLink>
          <NuxtLink to="/works" :class="{ active: activeSection === 'works' }">作品书架</NuxtLink>
          <NuxtLink to="/awards" :class="{ active: activeSection === 'ranking' }">十二橙器 <span class="tiny-orange">✳</span></NuxtLink>
        </nav>
        <div class="header-actions">
          <form class="header-search" :class="{ 'search-open': searchExpanded }" role="search" @submit.prevent="search"><button type="button" class="search-trigger" aria-label="打开搜索" @click="openSearch"><AppIcon name="search" :size="16" /></button><input ref="searchInput" v-model="query" aria-label="搜索帖子和作品" placeholder="寻找故事，也寻找同好" @keydown.esc="searchExpanded = false" /><kbd>↵</kbd><button v-if="searchExpanded" type="button" class="search-close" aria-label="关闭搜索" @click="searchExpanded = false"><AppIcon name="close" :size="14" /></button></form>
          <button class="icon-button theme-toggle" :aria-label="dark ? '切换浅色模式' : '切换深色模式'" @click="toggleTheme"><AppIcon :name="dark ? 'sun' : 'moon'" :size="19" /></button>
          <NuxtLink v-if="auth.user.value" to="/account" class="login-button" aria-label="进入用户中心"><UserAvatar class="mini-user" :src="auth.user.value.avatarUrl" :name="username" /><span>{{ username }}</span></NuxtLink><button v-else class="login-button" @click="loginOpen = true"><AppIcon name="login" :size="16" /><span>登录 / 加入</span></button>
        </div>
      </div>
    </header>
    <div v-if="auth.ready.value&&!forum.online.value" class="service-notice" role="status">社区服务暂时不可用，部分内容可能尚未更新。<button @click="forum.loadFeed()">重试连接</button></div>

    <div class="layout shell">
      <aside id="community-nav" class="left-sidebar" :class="{ 'mobile-open': mobileOpen }" aria-label="社区导航">
        <div class="sidebar-section">
          <p class="sidebar-caption">一起，把故事继续。</p>
          <NuxtLink to="/" class="sidebar-link" :class="{ selected: activeSection === 'home' && !route.query.saved }" @click="resetFeed"><AppIcon name="home" /><span>社区广场</span><span class="nav-dot"></span></NuxtLink>
          <NuxtLink to="/works" class="sidebar-link" :class="{ selected: activeSection === 'works' }"><AppIcon name="library" /><span>作品书架</span></NuxtLink>
          <NuxtLink to="/awards" class="sidebar-link" :class="{ selected: activeSection === 'ranking' }"><AppIcon name="trophy" /><span>十二橙器</span><span class="sidebar-new">活动</span></NuxtLink>
          <NuxtLink to="/?category=社团活动#discussions" class="sidebar-link" @click="query = ''"><AppIcon name="calendar" /><span>社团活动</span></NuxtLink>
        </div>
        <div class="sidebar-section">
          <p class="sidebar-label">讨论分区 <span>04</span></p>
          <NuxtLink to="/?category=作品讨论#discussions" class="sidebar-link category-link" @click="query = ''"><span class="category-dot orange"></span><span>作品讨论</span><span class="link-end">↗</span></NuxtLink>
          <NuxtLink to="/?category=阅读手记#discussions" class="sidebar-link category-link" @click="query = ''"><span class="category-dot green"></span><span>阅读手记</span><span class="link-end">↗</span></NuxtLink>
          <NuxtLink to="/?category=同好闲聊#discussions" class="sidebar-link category-link" @click="query = ''"><span class="category-dot blue"></span><span>同好闲聊</span><span class="link-end">↗</span></NuxtLink>
          <NuxtLink to="/?category=社团活动#discussions" class="sidebar-link category-link" @click="query = ''"><span class="category-dot purple"></span><span>社团活动</span><span class="link-end">↗</span></NuxtLink>
        </div>
        <div class="sidebar-section personal-section">
          <p class="sidebar-label">我的小角落</p>
          <NuxtLink to="/account" class="sidebar-link" :class="{ selected: activeSection === 'account' }"><AppIcon name="users" /><span>用户中心</span></NuxtLink>
          <NuxtLink to="/?saved=1#discussions" class="sidebar-link" :class="{ selected: !!route.query.saved }" @click="resetFeed"><AppIcon name="bookmark" /><span>我的收藏</span><span v-if="bookmarks.length" class="bookmark-count">{{ bookmarks.length }}</span></NuxtLink>
          <button class="sidebar-link" @click="composerOpen = true"><AppIcon name="pen" /><span>写点什么</span></button>
        </div>
        <div v-if="identity.can('campaign.manage')" class="sidebar-section staff-nav"><p class="sidebar-label">{{ identity.roleNames[identity.role.value] }}</p><NuxtLink to="/admin/awards" class="sidebar-link" :class="{ selected: activeSection === 'admin' }"><AppIcon name="filter" /><span>活动管理</span></NuxtLink></div>
        <div class="sidebar-bottom">
          <div class="sidebar-flower" aria-hidden="true">✳</div>
          <p>因为喜欢，<br>所以在这里相遇。</p>
          <NuxtLink to="/about">关于澄之响 <AppIcon name="arrowUpRight" :size="14" /></NuxtLink>
          <span class="preview-label">澄之响 · 同好社区</span>
        </div>
      </aside>

      <main id="main-content" class="page-content"><NuxtPage /></main>
    </div>

    <footer class="site-footer shell"><span><span class="footer-mark">✳</span> 澄之响 <span class="footer-separator">/</span> 南京工程学院视觉小说同好会</span><span>故事有终章，热爱有回响。<span class="footer-year">© {{ new Date().getFullYear() }}</span></span></footer>
    <ForumDialogs />
    <Transition name="toast"><div v-if="toast" role="status" class="toast-message"><AppIcon name="check" :size="18" />{{ toast }}</div></Transition>
  </div>
</template>
<style scoped>.service-notice{padding:.6rem 1rem;font-size:.65rem;text-align:center;background:var(--hero);color:var(--subtle)}.service-notice button{color:var(--orange);margin-left:.8rem}</style>
