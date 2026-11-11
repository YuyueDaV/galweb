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
const pageSize = 24
const page = ref(1)
const resultsHeading = ref<HTMLElement | null>(null)
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
const pageCount = computed(() => Math.max(1, Math.ceil(filteredWorks.value.length / pageSize)))
const pageStart = computed(() => (page.value - 1) * pageSize)
const pageWorks = computed(() => filteredWorks.value.slice(pageStart.value, pageStart.value + pageSize))
watch([search, company, order], () => {
  page.value = 1
})
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count)
})
async function changePage(nextPage: number) {
  page.value = Math.max(1, Math.min(nextPage, pageCount.value))
  await nextTick()
  resultsHeading.value?.scrollIntoView({ block: 'start' })
}
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
      <NuxtLink to="/works/new" class="button primary"><AppIcon name="plus" :size="16" />手动添加</NuxtLink
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
    <div ref="resultsHeading" class="library-toolbar">
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
    <div class="library-results-heading">
      <div class="shelf-view-switch" role="group" aria-label="书架展示方式">
        <button type="button" :aria-pressed="shelfView === 'cards'" @click="shelfView = 'cards'">
          卡片列表</button
        ><button type="button" :aria-pressed="shelfView === 'shelf'" @click="shelfView = 'shelf'">
          立体书架
        </button>
      </div>
      <p v-if="filteredWorks.length" class="library-page-summary" role="status">
        每页 {{ pageSize }} 部 · 当前第 {{ pageStart + 1 }}–{{ pageStart + pageWorks.length }} 部，共
        {{ filteredWorks.length }} 部
      </p>
    </div>
    <NuxtErrorBoundary v-if="shelfView === 'shelf'"
      ><Suspense
        ><LazyBookShelf :works="pageWorks" /><template #fallback
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
      <NuxtLink v-for="work in pageWorks" :key="work.rank" :to="`/works/${work.rank}`" class="work-card"
        ><div class="work-cover">
          <WorkCover
            :rank="work.rank"
            :src="
              work.coverUrl ||
              (work.rank > 12 ? work.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined)
            "
            variant="cover"
            :alt="`${work.title}封面`"
          /><WorkAwardBadge :work="work" overlay /><span class="work-cover-arrow"
            ><AppIcon name="arrowUpRight" :size="20"
          /></span>
        </div>
        <div class="work-card-copy">
          <p>{{ work.studio }}</p>
          <h3>{{ work.title }}</h3>
          <small v-if="work.addedBy" class="catalog-help">添加人：{{ work.addedBy.name }}</small
          ><span>{{ work.description }}</span>
          <div class="work-card-footer">
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
    <nav v-if="pageCount > 1" class="page-controls library-pagination" aria-label="作品书架分页">
      <button type="button" :disabled="page === 1" @click="changePage(page - 1)">上一页</button>
      <span>第 {{ page }} / {{ pageCount }} 页</span>
      <button type="button" :disabled="page === pageCount" @click="changePage(page + 1)">下一页</button>
    </nav>
    <p class="page-footnote">
      本书库收录同好会推荐作品，保留历届十二橙器档案；Bangumi
      评分为外部平台数据。封面及宣传图版权归各作品权利人所有。排名代表当届成员票选，每一种喜欢都值得被珍惜。
    </p>
  </div>
</template>

<style scoped>
.work-card-footer {
  gap: 0.5rem;
  font-size: max(14px, 0.7rem);
  font-weight: 400;
  line-height: 1.6;
}
.work-card-footer > .app-icon {
  flex-shrink: 0;
}
.library-toolbar {
  scroll-margin-top: 8rem;
}
.library-results-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.library-page-summary {
  color: var(--subtle);
  font-size: 14px;
  line-height: 1.8;
}
.library-pagination {
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 14px;
}
.library-pagination > button {
  min-width: 80px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  background: var(--orange-soft);
}
.library-pagination > span {
  color: var(--subtle);
  white-space: nowrap;
}
.library-toolbar > div {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  align-items: center;
}
.library-toolbar :is(.library-search, .feed-sort) {
  box-sizing: border-box;
  min-height: 2.5rem;
  padding: 0.4rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--muted) 48%, transparent);
  border-radius: 0.8rem;
  background: rgb(var(--liquid-rgb) / 80%);
  box-shadow:
    inset 0 1px 0 var(--liquid-highlight),
    0 3px 10px var(--liquid-shadow);
  -webkit-backdrop-filter: blur(8px) saturate(1.15);
  backdrop-filter: blur(8px) saturate(1.15);
  font-size: 0.75rem;
}
.library-toolbar :is(.library-search, .feed-sort):focus-within {
  border-color: var(--orange);
  box-shadow:
    0 0 0 3px var(--orange-soft),
    inset 0 1px 0 var(--liquid-highlight);
}
.library-toolbar .library-search input {
  width: 12rem;
  min-width: 0;
  font-size: max(16px, 0.8rem);
}
.library-toolbar .feed-sort select {
  box-sizing: border-box;
  min-height: 1.65rem;
  max-width: 12rem;
  padding: 0.15rem 1.6rem 0.15rem 0.35rem;
  background-color: transparent;
  box-shadow: none;
  color: var(--ink);
  font-size: 0.75rem;
}
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
  }
  .library-toolbar .library-search input {
    width: 100%;
    min-width: 0;
    font-size: 0.8rem;
  }
  .library-toolbar .feed-sort {
    min-width: 0;
    font-size: 0.75rem;
  }
  .library-toolbar .feed-sort select {
    min-width: 0;
    max-width: 100%;
    width: 100%;
    font-size: 0.75rem;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .library-toolbar :is(.library-search, .feed-sort) {
    background: var(--surface);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
</style>
