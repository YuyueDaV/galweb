<script setup lang="ts">
import type { Work } from '~/types/forum'
const auth = useAuth()
const api = useRequestFetch()
const { data, error, refresh } = await useAsyncData('work-catalog', () => api<Work[]>('/api/works'))
const works = computed(() => data.value || [])
const search = ref('')
const order = ref('managed')
const company = ref('')
const studioKey = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
function studioNames(work: Work) {
  return (work.studio || work.bangumi?.studio || '')
    .split(/[/／、;；]/)
    .map((value) => value.trim())
    .filter(Boolean)
}
const companies = computed(() => {
  const options = new Map<string, { name: string; count: number }>()
  for (const work of works.value) {
    for (const name of new Map(studioNames(work).map((name) => [studioKey(name), name])).values()) {
      const key = studioKey(name),
        existing = options.get(key)
      if (existing) existing.count++
      else options.set(key, { name, count: 1 })
    }
  }
  return [...options].sort((a, b) => a[1].name.localeCompare(b[1].name, 'zh-CN'))
})
function resetFilters() {
  search.value = ''
  company.value = ''
}
const shelfView = ref('cards')
const filteredWorks = computed(() => {
  const term = search.value.trim().toLowerCase()
  const list = works.value.filter(
    (work) =>
      (!company.value || studioNames(work).some((name) => studioKey(name) === company.value)) &&
      `${work.title} ${work.subtitle} ${work.studio} ${work.bangumi?.tags.join(' ') || ''}`
        .toLowerCase()
        .includes(term),
  )
  return order.value === 'name'
    ? [...list].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    : order.value === 'score'
      ? [...list].sort((a, b) => (b.bangumi?.score || 0) - (a.bangumi?.score || 0))
      : order.value === 'rank'
        ? [...list].sort((a, b) => a.rank - b.rank)
        : list
})
useSeoMeta({ title: '作品书架 · 澄之响' })
</script>

<template>
  <div class="library-page">
    <div class="page-kicker">
      <span class="category-dot orange"></span> OUR SHARED BOOKSHELF
      <span>{{ works.length }} STORIES, COUNTLESS MEMORIES</span>
    </div>
    <header class="subpage-hero">
      <div>
        <h1>下一部故事，<br />从这里<span>翻开。</span></h1>
        <p>从成员共同推荐的十二部视觉小说开始，<br />寻找下一次心动，也遇见有相同感动的人。</p>
      </div>
      <div class="shelf-illustration" aria-hidden="true">
        <WorkCover
          :rank="3"
          variant="cover"
          alt=""
          loading="eager"
          sizes="(max-width: 875px) 120px, 200px"
        /><WorkCover
          :rank="1"
          variant="cover"
          alt=""
          loading="eager"
          sizes="(max-width: 875px) 120px, 200px"
        /><WorkCover
          :rank="5"
          variant="cover"
          alt=""
          loading="eager"
          sizes="(max-width: 875px) 120px, 200px"
        /><span>the next chapter ↗</span>
      </div>
    </header>
    <div class="catalog-actions">
      <NuxtLink to="/works/new" class="button primary"><AppIcon name="plus" :size="16" />添加作品</NuxtLink
      ><NuxtLink to="/tiers" class="button secondary">同好会 Tier 榜单 ↗</NuxtLink
      ><NuxtLink
        v-if="auth.user.value && auth.user.value.role !== 'member'"
        to="/admin/works"
        class="text-link"
        >管理书库</NuxtLink
      >
    </div>
    <p v-if="error" class="form-error" role="alert">
      书库暂时未能加载。<button @click="refresh()">重试加载</button>
    </p>
    <BangumiSearch :works="works" @imported="refresh()" />
    <div class="library-toolbar">
      <h2>
        同好会的共同书单 <span>{{ filteredWorks.length }}</span>
      </h2>
      <div>
        <label class="library-search"
          ><AppIcon name="search" :size="16" /><input
            v-model="search"
            placeholder="搜索作品、制作组……"
            aria-label="搜索作品" /></label
        ><label class="feed-sort company-filter"
          ><span>会社</span
          ><select v-model="company" aria-label="按会社查找">
            <option value="">全部会社</option>
            <option v-for="[key, item] in companies" :key="key" :value="key">
              {{ item.name }}（{{ item.count }}）
            </option>
          </select></label
        ><label class="feed-sort"
          ><span class="sr-only">作品排序</span
          ><select v-model="order">
            <option value="managed">书架顺序</option>
            <option value="rank">按收录顺序</option>
            <option value="score">按 Bangumi 评分</option>
            <option value="name">按作品名称</option>
          </select></label
        >
      </div>
    </div>
    <div class="shelf-view-switch" role="group" aria-label="书架展示方式">
      <button type="button" :aria-pressed="shelfView === 'cards'" @click="shelfView = 'cards'">
        卡片列表</button
      ><button type="button" :aria-pressed="shelfView === 'shelf'" @click="shelfView = 'shelf'">
        立体书架
      </button>
    </div>
    <NuxtErrorBoundary v-if="shelfView === 'shelf'"
      ><Suspense
        ><LazyBookShelf :works="filteredWorks" /><template #fallback
          ><p class="shelf-loading" role="status">正在打开书架…</p></template
        ></Suspense
      ><template #error
        ><div class="shelf-loading" role="alert">
          <p>立体书架暂时未能加载，可以继续浏览卡片列表。</p>
          <button type="button" class="button secondary" @click="shelfView = 'cards'">返回卡片列表</button>
        </div></template
      ></NuxtErrorBoundary
    >
    <div v-else class="works-grid">
      <NuxtLink v-for="work in filteredWorks" :key="work.rank" :to="`/works/${work.rank}`" class="work-card"
        ><div class="work-cover">
          <WorkCover
            :rank="work.rank"
            :src="
              work.coverUrl ||
              (work.rank > 12 ? work.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined)
            "
            variant="cover"
            :alt="`${work.title}封面`"
          /><span class="work-rank"
            >{{ work.archiveRank ? String(work.archiveRank).padStart(2, '0') : work.bangumi ? 'BGM' : 'BOOK'
            }}<span>{{ work.archiveRank ? '十二橙器' : '书库收录' }}</span></span
          ><span class="work-cover-arrow"><AppIcon name="arrowUpRight" :size="20" /></span>
        </div>
        <div class="work-card-copy">
          <p>{{ work.studio }}</p>
          <h3>{{ work.title }}</h3>
          <small v-if="work.addedBy" class="catalog-help">添加人：{{ work.addedBy.name }}</small
          ><span>{{ work.description }}</span>
          <div>
            <span>{{ work.bangumi?.score ? `Bangumi ${work.bangumi.score.toFixed(1)}` : '成员推荐' }}</span
            ><AppIcon name="arrowRight" :size="16" />
          </div></div
      ></NuxtLink>
    </div>
    <div v-if="!filteredWorks.length" class="empty-state">
      <AppIcon name="search" :size="30" />
      <h3>书架上还没有找到这部作品</h3>
      <p>试试作品的中文名、英文名或制作组。</p>
      <button class="button secondary" @click="resetFilters">查看全部作品</button>
    </div>
    <p class="page-footnote">
      本书库收录同好会推荐作品，保留历届十二橙器档案；Bangumi
      评分为外部平台数据。封面及宣传图版权归各作品权利人所有。排名代表当届成员票选，每一种喜欢都值得被珍惜。
    </p>
  </div>
</template>

<style scoped>
.company-filter {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
}
.company-filter select {
  max-width: 13rem;
  min-width: 0;
  text-overflow: ellipsis;
}
.company-filter > span {
  flex-shrink: 0;
  white-space: nowrap;
}
@media (max-width: 600px) {
  .library-toolbar > div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.75rem;
  }
  .library-search {
    grid-column: 1 / -1;
    padding: 0.55rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
  }
  .library-search input {
    width: 100%;
    min-width: 0;
    font-size: 0.8rem;
  }
  .library-toolbar .feed-sort {
    padding: 0.45rem 0.5rem;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 0.5rem;
    background: var(--surface);
    font-size: 0.65rem;
  }
  .library-toolbar .feed-sort select {
    min-width: 0;
    max-width: 100%;
    width: 100%;
    font-size: 0.7rem;
  }
}
</style>
