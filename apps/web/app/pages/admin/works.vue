<script setup lang="ts">
import type { Work } from '~/types/forum'
const auth = useAuth(),
  { loginOpen } = useForum()
const route = useRoute()
const allowed = computed(() => ['admin', 'super_admin'].includes(auth.user.value?.role || ''))
const canEditSelected = computed(
  () => !!selected.value && (auth.user.value?.role === 'super_admin' || !selected.value.submittedForAwards),
)
const works = ref<Work[]>([]),
  query = ref(''),
  selected = ref<Work | null>(null),
  busy = ref(false),
  coverBusy = ref(false),
  error = ref(''),
  success = ref('')
const originalOrder = ref<number[]>([]),
  dragged = ref<number | null>(null),
  orderNotice = ref('')
const deleteOpen = ref(false),
  deleteTarget = ref<Work | null>(null)
function confirmDelete() {
  if (locked.value || !selected.value || !canEditSelected.value) return
  deleteTarget.value = { ...selected.value }
  deleteOpen.value = true
}
async function removeWork() {
  const target = deleteTarget.value
  if (!target || locked.value || !canEditSelected.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    await auth.request('/admin/works/' + target.rank, { version: target.version || 0 }, 'DELETE')
    works.value = works.value.filter((work) => work.rank !== target.rank)
    originalOrder.value = originalOrder.value.filter((id) => id !== target.rank)
    if (selected.value?.rank === target.rank) {
      selected.value = null
      if (works.value[0]) select(works.value[0])
    }
    orderNotice.value = orderDirty.value ? '还有尚未保存的排序。' : ''
    success.value = `《${target.title}》已从书库删除，关联历史记录已保留。`
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
const orderDirty = computed(() => works.value.some((work, index) => originalOrder.value[index] !== work.rank))
const canReorder = computed(() => !locked.value && !query.value.trim())
function moveWork(id: number, step: number) {
  if (!canReorder.value) return
  const index = works.value.findIndex((work) => work.rank === id),
    target = index + step
  if (index < 0 || target < 0 || target >= works.value.length) return
  const [item] = works.value.splice(index, 1)
  works.value.splice(target, 0, item!)
  orderNotice.value = `《${item!.title}》已移至第 ${target + 1} 位，保存排序后生效。`
}
function startDrag(event: DragEvent, id: number) {
  if (!canReorder.value) {
    event.preventDefault()
    return
  }
  dragged.value = id
  event.dataTransfer?.setData('text/plain', String(id))
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function dropWork(targetId: number) {
  const id = dragged.value
  dragged.value = null
  if (!canReorder.value || id === null || id === targetId) return
  const from = works.value.findIndex((work) => work.rank === id),
    to = works.value.findIndex((work) => work.rank === targetId)
  if (from < 0 || to < 0) return
  moveWork(id, to - from)
}
function undoOrder() {
  if (locked.value) return
  const positions = new Map(originalOrder.value.map((id, index) => [id, index]))
  works.value.sort((a, b) => positions.get(a.rank)! - positions.get(b.rank)!)
  orderNotice.value = '已撤销尚未保存的排序。'
}
async function saveOrder() {
  if (locked.value || !orderDirty.value) return
  busy.value = true
  error.value = ''
  try {
    const data = await auth.request<Work[]>(
      '/admin/works/order',
      { workIds: works.value.map((work) => work.rank), previousWorkIds: originalOrder.value },
      'PUT',
    )
    works.value = data
    originalOrder.value = data.map((work) => work.rank)
    orderNotice.value = '书库顺序已保存，作品书架默认按此顺序展示。'
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
const filtered = computed(() =>
  works.value.filter((work) =>
    `${work.title} ${work.subtitle} ${work.studio}`.toLowerCase().includes(query.value.trim().toLowerCase()),
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
    originalOrder.value = data.map((work) => work.rank)
    orderNotice.value = ''
    const requestedId =
      typeof route.query.work === 'string' && /^\d+$/.test(route.query.work) ? Number(route.query.work) : null
    const requested = data.find((work) => work.rank === requestedId)
    if (requested) select(requested)
    else if (selected.value) select(data.find((work) => work.rank === selected.value?.rank) || data[0]!)
  } catch (cause) {
    if (current === revision) error.value = (cause as Error).message
  }
}
watch(
  () => route.query.work,
  () => {
    if (locked.value || typeof route.query.work !== 'string') return
    const target = works.value.find((work) => work.rank === Number(route.query.work))
    if (target) select(target)
  },
)
async function save() {
  if (!selected.value || locked.value || !canEditSelected.value) return
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
  if (!work?.bangumi || locked.value || !canEditSelected.value) return
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
  invalidateWorkCatalog()
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
          <AppIcon name="plus" :size="16" />手动添加
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
          <p class="catalog-help">拖拽排序手柄调整顺序；也可使用上下移按钮，或聚焦手柄后按方向键。</p>
          <p v-if="query.trim()" class="catalog-help">清空筛选后可调整书库顺序。</p>
          <div class="catalog-actions">
            <button type="button" class="button primary" :disabled="locked || !orderDirty" @click="saveOrder">
              保存排序
            </button>
            <button
              type="button"
              class="button secondary"
              :disabled="locked || !orderDirty"
              @click="undoOrder"
            >
              撤销排序
            </button>
            <button type="button" class="text-link" :disabled="locked" @click="load">重新加载</button>
          </div>
          <p v-if="orderNotice" class="catalog-help" role="status">{{ orderNotice }}</p>
          <div class="catalog-work-list">
            <div
              v-for="work in filtered"
              :key="work.rank"
              class="catalog-order-row"
              :data-work-id="work.rank"
              :class="{ dragging: dragged === work.rank }"
              @dragover.prevent
              @drop.prevent="dropWork(work.rank)"
            >
              <button
                type="button"
                class="order-handle"
                :draggable="canReorder"
                :disabled="!canReorder"
                :aria-label="`拖拽排序${work.title}`"
                @dragstart="startDrag($event, work.rank)"
                @dragend="dragged = null"
                @keydown.up.prevent="moveWork(work.rank, -1)"
                @keydown.down.prevent="moveWork(work.rank, 1)"
              >
                <span aria-hidden="true">⠿</span>
              </button>
              <button
                type="button"
                class="order-work-title"
                :aria-pressed="selected?.rank === work.rank"
                :disabled="locked"
                @click="select(work)"
              >
                {{ work.title }} <span v-if="work.bangumi">· BGM</span>
              </button>
              <div class="order-controls">
                <button
                  type="button"
                  :aria-label="`上移${work.title}`"
                  :disabled="!canReorder || works[0]?.rank === work.rank"
                  @click="moveWork(work.rank, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  :aria-label="`下移${work.title}`"
                  :disabled="!canReorder || works.at(-1)?.rank === work.rank"
                  @click="moveWork(work.rank, 1)"
                >
                  ↓
                </button>
              </div>
            </div>
          </div>
        </section>
        <form v-if="selected" class="experience-card settings-form" @submit.prevent="save">
          <p v-if="selected.submittedForAwards" class="catalog-help" role="status">
            已提交提名 · 由超级管理员维护作品资料。
          </p>
          <p v-else class="catalog-help">尚未提交提名 · 管理员可维护资料。</p>
          <fieldset class="plain-fieldset" :disabled="locked || !canEditSelected">
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
              :disabled="busy || !canEditSelected"
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
            <div class="catalog-delete-zone">
              <button type="button" class="button secondary" :disabled="locked" @click="confirmDelete">
                <AppIcon name="close" :size="16" />删除书库作品
              </button>
              <p class="catalog-help">从公共书架移除；关联帖子、个人书单、Tier 榜与活动历史保留。</p>
            </div>
          </fieldset>
        </form>
        <div v-else class="experience-card empty-state">从左侧选择作品，编辑书库资料。</div>
      </div></template
    >
    <div v-else class="empty-state">
      <p>需要管理员账号。</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
    <ActionDialog
      v-model="deleteOpen"
      title="删除书库作品？"
      :message="`确认将《${deleteTarget?.title || ''}》从公共书架删除？关联帖子、书单、Tier 榜和活动历史会保留，管理员可重新收录恢复。`"
      primary="确认删除"
      secondary="保留作品"
      tone="confirm"
      @primary="removeWork"
    />
  </div>
</template>
<style scoped>
.catalog-delete-zone {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}
.catalog-delete-zone .button {
  color: var(--orange);
}
.catalog-order-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.catalog-order-row.dragging {
  opacity: 0.45;
}
.catalog-order-row button {
  border-bottom: 0;
}
.catalog-order-row .order-work-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.catalog-order-row .order-handle {
  width: 1.8rem;
  padding: 0.6rem 0.2rem;
  flex-shrink: 0;
  color: var(--subtle);
  cursor: grab;
  font-size: 1.1rem;
  text-align: center;
}
.order-controls {
  display: flex;
  flex-shrink: 0;
}
.order-controls button {
  display: grid;
  place-items: center;
  width: 1.6rem;
  min-height: 2.2rem;
  padding: 0.25rem;
  font-size: 0.85rem;
  color: var(--subtle);
  border-radius: 0.3rem;
}
.order-controls button:not(:disabled):hover {
  background: var(--orange-soft);
  color: var(--orange);
}
</style>
