<script setup lang="ts">
import type { Work } from '~/types/forum'
import type { BangumiSubject } from '~/types/catalog'
import { normalizeWorkTitle } from '~/utils/awards'
const props = defineProps<{
  works: Work[]
  selectable?: boolean
  selecting?: boolean
  personal?: boolean
  selectionLabel?: string
  contribution?: boolean
}>()
const emit = defineEmits<{
  imported: []
  selected: [payload: { subject: BangumiSubject }]
}>()
const auth = useAuth()
const query = ref(''),
  submitted = ref(''),
  page = ref(1),
  total = ref(0)
const includeRestricted = ref(false)
const failedCovers = ref(new Set<number>())
const coverRetries = reactive<Record<number, number>>({})
function retryCover(id: number) {
  failedCovers.value.delete(id)
  coverRetries[id] = (coverRetries[id] || 0) + 1
}
const completionOpen = ref(false),
  collected = ref<Work | null>(null),
  alreadyCollected = ref(false)
function showExisting(work: Work) {
  collected.value = work
  alreadyCollected.value = true
  completionOpen.value = true
}
function chooseSubject(item: BangumiSubject) {
  const existing = local(item)
  if (props.contribution && existing) showExisting(existing)
  else emit('selected', { subject: item })
}
async function continueSearching() {
  query.value = ''
  resetResults()
  await nextTick()
  document.getElementById('bangumi-query')?.focus()
}
async function viewCollected() {
  if (collected.value) await navigateTo('/works/' + collected.value.rank)
}
const results = ref<BangumiSubject[]>([]),
  loading = ref(false),
  busy = ref(0),
  error = ref(''),
  success = ref('')
const manager = computed(() => ['admin', 'super_admin'].includes(auth.user.value?.role || ''))
let version = 0
function resetResults() {
  ++version
  results.value = []
  failedCovers.value.clear()
  submitted.value = ''
  total.value = 0
  loading.value = false
  error.value = ''
  success.value = ''
}
watch(includeRestricted, resetResults)
watch(
  () => auth.user.value?.id,
  () => {
    includeRestricted.value = false
    resetResults()
  },
)
function local(item: BangumiSubject) {
  const keys = [item.title, item.originalTitle].map(normalizeWorkTitle).filter(Boolean)
  return props.works.find(
    (work) =>
      work.bangumi?.id === item.id ||
      [work.title, work.subtitle, work.bangumi?.title, work.bangumi?.originalTitle]
        .filter(Boolean)
        .some((name) => keys.includes(normalizeWorkTitle(name!))),
  )
}
async function search(next = 1) {
  const keyword = (next === 1 ? query.value : submitted.value).trim()
  if (!keyword) {
    error.value = '请输入作品名称。'
    return
  }
  const request = ++version
  loading.value = true
  error.value = ''
  success.value = ''
  results.value = []
  failedCovers.value.clear()
  try {
    const response = await $fetch<{ items: BangumiSubject[]; total: number }>(
      `/api/bangumi/search?q=${encodeURIComponent(keyword)}&page=${next}${includeRestricted.value ? '&includeRestricted=true' : ''}`,
    )
    if (request !== version) return
    submitted.value = keyword
    page.value = next
    results.value = response.items
    total.value = response.total
  } catch (cause) {
    if (request === version)
      error.value =
        (cause as { data?: { message?: string } }).data?.message || 'Bangumi 搜索失败，请稍后重试。'
  } finally {
    if (request === version) loading.value = false
  }
}
async function collect(item: BangumiSubject) {
  if (busy.value) return
  busy.value = item.id
  error.value = ''
  success.value = ''
  try {
    const result = await auth.request<{ work: Work; reused: boolean }>('/admin/works/import', {
      subjectId: item.id,
    })
    success.value = result.reused
      ? `《${result.work.title}》已在书库中。`
      : `《${result.work.title}》已收录，作品资料可以在书库管理中编辑。`
    emit('imported')
    collected.value = result.work
    alreadyCollected.value = result.reused
    completionOpen.value = true
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = 0
  }
}
onBeforeUnmount(() => {
  ++version
})
</script>
<template>
  <section class="bangumi-panel experience-card" aria-labelledby="bangumi-search-heading">
    <div class="section-heading">
      <div>
        <p class="eyebrow">DISCOVER MORE STORIES</p>
        <h2 id="bangumi-search-heading">搜索 Bangumi<span class="heading-dot">。</span></h2>
      </div>
      <a href="https://bgm.tv" target="_blank" rel="noopener noreferrer">资料来源：Bangumi ↗</a>
    </div>
    <form class="catalog-search" @submit.prevent="search(1)">
      <label class="sr-only" for="bangumi-query">Bangumi 作品名称</label
      ><input
        id="bangumi-query"
        v-model="query"
        maxlength="100"
        placeholder="搜索中文名、日文名或英文名，例如 CLANNAD"
      /><button class="button primary" :disabled="loading">{{ loading ? '搜索中…' : '搜索 Bangumi' }}</button>
    </form>
    <label v-if="auth.user.value" class="bangumi-visibility"
      ><input v-model="includeRestricted" type="checkbox" />包含受限条目</label
    >
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success" role="status">{{ success }}</p>
    <p v-if="loading" role="status">正在查找故事…</p>
    <p v-else-if="submitted && !results.length && !error" class="catalog-help">
      没有找到匹配的游戏条目，试试原文名或其他版本名称；部分条目可能受 Bangumi
      访问权限限制，也可手动添加作品。
    </p>
    <div class="bangumi-results">
      <article v-for="item in results" :key="item.id" class="bangumi-result">
        <SafeImage
          :key="item.id + ':' + (coverRetries[item.id] || 0)"
          :src="item.coverUrl || '/images/work-placeholder.svg'"
          :alt="item.title + '封面'"
          width="80"
          height="110"
          loading="lazy"
          referrerpolicy="no-referrer"
          @error="failedCovers.add(item.id)"
        />
        <div>
          <h3>{{ item.title }} <small v-if="item.nsfw" class="bangumi-restricted">受限条目</small></h3>
          <button
            v-if="failedCovers.has(item.id)"
            type="button"
            class="text-link cover-retry"
            :aria-label="`重试${item.title}封面`"
            @click="retryCover(item.id)"
          >
            封面暂不可用，稍后重试<AppIcon name="arrowRight" :size="13" />
          </button>
          <p class="catalog-help">{{ item.originalTitle }}</p>
          <p class="catalog-help">
            {{ item.date || '发售日期待补充' }} ·
            {{ item.score ? `Bangumi ${item.score.toFixed(1)}` : '暂无评分' }}
          </p>
          <div class="catalog-actions">
            <a :href="`https://bgm.tv/subject/${item.id}`" target="_blank" rel="noopener noreferrer"
              >查看 Bangumi ↗</a
            ><button v-if="local(item)" type="button" class="text-link" @click="showExisting(local(item)!)">
              已收录 · 查看作品
            </button>
          </div>
          <div v-if="manager && !personal && !selectable && !local(item)" class="catalog-actions">
            <button class="button secondary" :disabled="!!busy" @click="collect(item)">
              {{ busy === item.id ? '收录中…' : '收录到书库' }}
            </button>
          </div>
          <NuxtLink
            v-if="auth.user.value && !manager && !personal && !selectable && !local(item)"
            class="button secondary"
            :to="'/works/new?bangumi=' + item.id + (item.nsfw ? '&restricted=1' : '')"
            >添加到书库</NuxtLink
          >
          <button
            v-if="selectable"
            type="button"
            class="button secondary"
            :disabled="selecting"
            @click="chooseSubject(item)"
          >
            {{ selectionLabel || '加入榜单作品池' }}
          </button>
        </div>
      </article>
    </div>
    <div v-if="results.length" class="page-controls">
      <button :disabled="page === 1 || loading" @click="search(page - 1)">上一页</button
      ><span>第 {{ page }} 页 · {{ total }} 个结果</span
      ><button :disabled="page * 10 >= total || loading" @click="search(page + 1)">下一页</button>
    </div>
    <ActionDialog
      v-model="completionOpen"
      :title="alreadyCollected ? '作品已收录' : '作品添加成功'"
      :message="
        alreadyCollected
          ? `书库已收录《${collected?.title || ''}》，无需重复添加。可以查看已有作品，或继续查找其他作品。`
          : `《${collected?.title || ''}》已加入书库，要继续添加下一部作品吗？`
      "
      primary="继续添加"
      :secondary="alreadyCollected ? '查看已有作品' : '查看作品'"
      @primary="continueSearching"
      @secondary="viewCollected"
    />
  </section>
</template>
<style scoped>
.bangumi-visibility {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
  font-size: 0.75rem;
  color: var(--subtle);
}
.bangumi-visibility input {
  accent-color: var(--orange);
  width: 1rem;
  height: 1rem;
}
.bangumi-restricted {
  display: inline-block;
  font-family: var(--sans);
  font-size: 0.6rem;
  font-weight: 400;
  color: var(--purple);
  border: 1px solid var(--line);
  border-radius: 0.25rem;
  padding: 0.1rem 0.35rem;
  vertical-align: middle;
}
</style>
