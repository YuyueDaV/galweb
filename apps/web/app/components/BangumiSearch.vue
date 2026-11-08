<script setup lang="ts">
import type { Work } from '~/types/forum'
import type { BangumiSubject } from '~/types/catalog'
const props = defineProps<{ works: Work[]; selectable?: boolean; selecting?: boolean; personal?: boolean }>()
const emit = defineEmits<{
  imported: []
  selected: [payload: { subject: BangumiSubject; existingWorkId?: number }]
}>()
const auth = useAuth()
const query = ref(''),
  submitted = ref(''),
  page = ref(1),
  total = ref(0)
const results = ref<BangumiSubject[]>([]),
  loading = ref(false),
  busy = ref(0),
  error = ref(''),
  success = ref('')
const target = reactive<Record<number, number>>({})
const manager = computed(() => ['admin', 'super_admin'].includes(auth.user.value?.role || ''))
let version = 0
function local(id: number) {
  return props.works.find((work) => work.bangumi?.id === id)
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
  try {
    const response = await $fetch<{ items: BangumiSubject[]; total: number }>(
      `/api/bangumi/search?q=${encodeURIComponent(keyword)}&page=${next}`,
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
  const existing = props.works.find((work) => work.rank === target[item.id])
  try {
    const result = await auth.request<{ work: Work; reused: boolean }>('/admin/works/import', {
      subjectId: item.id,
      ...(existing ? { existingWorkId: existing.rank, version: existing.version || 0 } : {}),
    })
    success.value = result.reused
      ? `《${result.work.title}》已在书库中。`
      : `《${result.work.title}》已收录，作品资料可以在书库管理中编辑。`
    emit('imported')
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
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success" role="status">{{ success }}</p>
    <p v-if="loading" role="status">正在查找故事…</p>
    <p v-else-if="submitted && !results.length && !error" class="catalog-help">
      没有找到匹配的游戏条目，试试原文名或其他版本名称。
    </p>
    <div class="bangumi-results">
      <article v-for="item in results" :key="item.id" class="bangumi-result">
        <SafeImage
          :src="item.coverUrl || '/images/work-placeholder.svg'"
          :alt="item.title + '封面'"
          width="80"
          height="110"
          loading="lazy"
          referrerpolicy="no-referrer"
        />
        <div>
          <h3>{{ item.title }}</h3>
          <p class="catalog-help">{{ item.originalTitle }}</p>
          <p class="catalog-help">
            {{ item.date || '发售日期待补充' }} ·
            {{ item.score ? `Bangumi ${item.score.toFixed(1)}` : '暂无评分' }}
          </p>
          <div class="catalog-actions">
            <a :href="`https://bgm.tv/subject/${item.id}`" target="_blank" rel="noopener noreferrer"
              >查看 Bangumi ↗</a
            ><NuxtLink v-if="local(item.id)" :to="'/works/' + local(item.id)!.rank"
              >已收录 · 查看作品</NuxtLink
            >
          </div>
          <div v-if="manager && !personal && !local(item.id)" class="catalog-actions">
            <select v-model.number="target[item.id]" :aria-label="item.title + '收录方式'">
              <option :value="undefined">作为新作品收录</option>
              <option
                v-for="work in works.filter((work) => !work.bangumi)"
                :key="work.rank"
                :value="work.rank"
              >
                关联已有：{{ work.title }}
              </option></select
            ><button v-if="!selectable" class="button secondary" :disabled="!!busy" @click="collect(item)">
              {{ busy === item.id ? '收录中…' : '收录到书库' }}
            </button>
          </div>
          <button
            v-if="selectable"
            type="button"
            class="button secondary"
            :disabled="selecting"
            @click="emit('selected', { subject: item, existingWorkId: target[item.id] })"
          >
            加入榜单作品池
          </button>
        </div>
      </article>
    </div>
    <div v-if="results.length" class="page-controls">
      <button :disabled="page === 1 || loading" @click="search(page - 1)">上一页</button
      ><span>第 {{ page }} 页 · {{ total }} 个结果</span
      ><button :disabled="page * 10 >= total || loading" @click="search(page + 1)">下一页</button>
    </div>
  </section>
</template>
