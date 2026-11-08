<script setup lang="ts">
import type { Work } from '~/types/forum'
const auth = useAuth(),
  { loginOpen } = useForum()
const allowed = computed(() => ['admin', 'super_admin'].includes(auth.user.value?.role || ''))
const works = ref<Work[]>([]),
  query = ref(''),
  selected = ref<Work | null>(null),
  busy = ref(false),
  coverBusy = ref(false),
  error = ref(''),
  success = ref('')
const filtered = computed(() =>
  works.value.filter((work) =>
    `${work.title} ${work.subtitle} ${work.studio}`.toLowerCase().includes(query.value.toLowerCase()),
  ),
)
const form = reactive({ title: '', subtitle: '', studio: '', description: '', nominator: '', version: 0 })
const locked = computed(() => busy.value || coverBusy.value)
function coverUpdated(work: Work) {
  works.value = works.value.map((item) => (item.rank === work.rank ? work : item))
  if (selected.value?.rank === work.rank) {
    selected.value = work
    form.version = work.version || 0
  }
}
let revision = 0
function select(work: Work) {
  selected.value = work
  Object.assign(form, {
    title: work.title,
    subtitle: work.subtitle,
    studio: work.studio,
    description: work.description,
    nominator: work.nominator,
    version: work.version || 0,
  })
  error.value = ''
  success.value = ''
}
async function load() {
  const current = ++revision
  await auth.initialize()
  if (!allowed.value) {
    works.value = []
    selected.value = null
    return
  }
  try {
    const data = await auth.request<Work[]>('/admin/works')
    if (current !== revision) return
    works.value = data
    if (selected.value) select(data.find((work) => work.rank === selected.value?.rank) || data[0]!)
  } catch (cause) {
    if (current === revision) error.value = (cause as Error).message
  }
}
async function save() {
  if (!selected.value || locked.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const work = await auth.request<Work>('/admin/works/' + selected.value.rank, { ...form }, 'PATCH')
    works.value = works.value.map((item) => (item.rank === work.rank ? work : item))
    select(work)
    success.value = '作品资料已保存，书架与详情页已更新。'
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function syncBangumi() {
  const work = selected.value
  if (!work?.bangumi || locked.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const result = await auth.request<{ work: Work }>('/admin/works/import', {
      subjectId: work.bangumi.id,
      existingWorkId: work.rank,
      version: work.version || 0,
    })
    works.value = works.value.map((item) => (item.rank === work.rank ? result.work : item))
    select(result.work)
    success.value = 'Bangumi 资料已更新，保留管理员编辑的作品文案。'
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
onMounted(load)
watch(() => auth.user.value?.id, load)
onBeforeUnmount(() => {
  ++revision
})
useSeoMeta({ title: '书库管理 · 澄之响', robots: 'noindex,nofollow' })
</script>
<template>
  <div class="experience-page">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">OUR SHARED CATALOG</p>
        <h1>书库管理<span>。</span></h1>
        <p>搜索收录更多作品，也为原来的十二部故事补全资料。</p>
      </div>
      <div class="catalog-actions">
        <NuxtLink v-if="allowed" to="/works/new" class="button primary">
          <AppIcon name="plus" :size="16" />添加作品
        </NuxtLink>
        <NuxtLink to="/admin/tiers" class="text-link">管理 Tier 榜单 ↗</NuxtLink>
      </div>
    </header>
    <template v-if="allowed"
      ><BangumiSearch :works="works" @imported="load" />
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="success" class="form-success" role="status">{{ success }}</p>
      <div class="catalog-manager-grid">
        <section class="experience-card">
          <h2>已收录作品 · {{ works.length }}</h2>
          <label class="community-field">筛选书库<input v-model="query" placeholder="名称或制作组" /></label>
          <div class="catalog-work-list">
            <button
              v-for="work in filtered"
              :key="work.rank"
              :aria-pressed="selected?.rank === work.rank"
              :disabled="locked"
              @click="select(work)"
            >
              {{ work.title }} <span v-if="work.bangumi">· BGM</span>
            </button>
          </div>
        </section>
        <form v-if="selected" class="experience-card settings-form" @submit.prevent="save">
          <fieldset class="plain-fieldset" :disabled="locked">
            <h2>编辑作品</h2>
            <p class="catalog-help">
              编号 {{ selected.rank
              }}{{ selected.archiveRank ? ` · 历史十二橙器第 ${selected.archiveRank} 名` : '' }}。关联 Bangumi
              保留原有作品编号、书单和讨论。
            </p>
            <WorkCoverEditor
              :key="selected.rank"
              :work="selected"
              embedded
              :disabled="busy"
              @busy="coverBusy = $event"
              @updated="coverUpdated"
            />
            <label class="community-field"
              >作品名称<input v-model="form.title" required maxlength="160" /></label
            ><label class="community-field"
              >原文名 / 副标题<input v-model="form.subtitle" maxlength="160" /></label
            ><label class="community-field">制作组<input v-model="form.studio" maxlength="200" /></label
            ><label class="community-field"
              >书库简介<textarea v-model="form.description" rows="7" maxlength="8000"></textarea></label
            ><label class="community-field">推荐来源<input v-model="form.nominator" maxlength="200" /></label>
            <div class="catalog-actions">
              <button class="button primary">{{ busy ? '保存中…' : '保存作品资料' }}</button
              ><NuxtLink :to="'/works/' + selected.rank">查看作品 ↗</NuxtLink
              ><button v-if="selected.bangumi" type="button" class="button secondary" @click="syncBangumi">
                更新 Bangumi 资料
              </button>
            </div>
            <p v-if="selected.bangumi" class="catalog-help">
              已关联 Bangumi #{{
                selected.bangumi.id
              }}。封面、评分、标签和原站简介单独保存；更新外部资料不会覆盖上方编辑的文案。
            </p>
          </fieldset>
        </form>
        <div v-else class="experience-card empty-state">从左侧选择作品，编辑书库资料。</div>
      </div></template
    >
    <div v-else class="empty-state">
      <p>需要管理员账号。</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
  </div>
</template>
