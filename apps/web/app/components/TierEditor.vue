<script setup lang="ts">
import type { TierList, TierLevel } from '~/types/catalog'
import type { Work } from '~/types/forum'
import type { BangumiSubject } from '~/types/catalog'
const props = withDefaults(defineProps<{ personal?: boolean }>(), { personal: false })
const endpoint = computed(() => (props.personal ? '/my/tier-lists' : '/admin/tier-lists'))
const unpublishOpen = ref(false)
import { tierTextColor } from '~/utils/tier-colors'
const auth = useAuth(),
  { loginOpen } = useForum()
const allowed = computed(() =>
  props.personal ? !!auth.user.value : ['admin', 'super_admin'].includes(auth.user.value?.role || ''),
)
const lists = ref<TierList[]>([]),
  works = ref<Work[]>([]),
  form = ref<TierList | null>(null)
const error = ref(''),
  success = ref(''),
  busy = ref(false),
  search = ref(''),
  destination = ref('s'),
  dragged = ref<number | null>(null),
  dirty = ref(false)
const clone = <T,>(data: T): T => JSON.parse(JSON.stringify(data))
const pool = computed(() =>
  works.value.filter(
    (work) =>
      !form.value?.rows.some((row) => row.workIds.includes(work.rank)) &&
      `${work.title} ${work.studio}`.toLowerCase().includes(search.value.toLowerCase()),
  ),
)
const byId = computed(() => new Map(works.value.map((work) => [work.rank, work])))
let revision = 0
function select(list: TierList) {
  form.value = clone(list)
  destination.value = list.rows[0]!.id
  dirty.value = false
  error.value = ''
  success.value = ''
}
async function load() {
  const current = ++revision
  await auth.initialize()
  if (!allowed.value) {
    lists.value = []
    form.value = null
    return
  }
  try {
    const [boards, catalog] = await Promise.all([
      auth.request<TierList[] | { items: TierList[]; works: Work[] }>(endpoint.value),
      auth.request<Work[]>(props.personal ? '/works' : '/admin/works'),
    ])
    if (current !== revision) return
    lists.value = Array.isArray(boards) ? boards : boards.items
    works.value = [
      ...new Map(
        [...catalog, ...(Array.isArray(boards) ? [] : boards.works)].map((work) => [work.rank, work]),
      ).values(),
    ]
  } catch (cause) {
    if (current === revision) error.value = (cause as Error).message
  }
}
async function create() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const list = await auth.request<TierList>(endpoint.value, {
      title: props.personal ? '我的作品 Tier 榜' : '同好会作品 Tier 榜',
    })
    lists.value.unshift(list)
    select(list)
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function save(action: 'save' | 'publish' | 'unpublish') {
  if (!form.value || busy.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const { title, description, rows, version } = form.value
    const result = await auth.request<TierList>(
      endpoint.value + '/' + form.value.id,
      { title, description, rows, version, action },
      'PUT',
    )
    lists.value = lists.value.map((list) => (list.id === result.id ? result : list))
    select(result)
    success.value =
      action === 'publish'
        ? '榜单已发布，访客可以查看。'
        : action === 'unpublish'
          ? '榜单已下架，草稿仍然保留。'
          : '草稿已保存，公开榜单保持上次发布的内容。'
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
function moveWork(id: number, target: string) {
  const row = form.value?.rows.find((row) => row.id === target)
  if (!row || busy.value) return
  for (const level of form.value!.rows) level.workIds = level.workIds.filter((value) => value !== id)
  row.workIds.push(id)
  dirty.value = true
}
function removeWork(id: number) {
  for (const row of form.value!.rows) row.workIds = row.workIds.filter((value) => value !== id)
  dirty.value = true
}
function reorder<T>(items: T[], index: number, step: number) {
  if (index + step < 0 || index + step >= items.length) return
  const [item] = items.splice(index, 1)
  items.splice(index + step, 0, item!)
  dirty.value = true
}
function addLevel() {
  if (form.value!.rows.length >= 20) return
  form.value!.rows.push({ id: crypto.randomUUID(), label: '新分层', color: '#c7c9c0', workIds: [] })
  dirty.value = true
}
function removeLevel(row: TierLevel) {
  if (form.value!.rows.length <= 1) return
  form.value!.rows = form.value!.rows.filter((level) => level.id !== row.id)
  destination.value = form.value!.rows[0]!.id
  dirty.value = true
}
function drop(row: TierLevel) {
  if (dragged.value !== null) moveWork(dragged.value, row.id)
  dragged.value = null
}
async function addBangumi(payload: { subject: BangumiSubject }) {
  if (busy.value || !form.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const imported = await auth.request<{ work: Work }>(
      props.personal ? '/my/tier-works/import' : '/admin/works/import',
      {
        subjectId: payload.subject.id,
      },
    )
    works.value = [...new Map([...works.value, imported.work].map((work) => [work.rank, work])).values()]
    busy.value = false
    moveWork(imported.work.rank, destination.value)
    success.value = '已加入作品池，请保存或发布榜单。'
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
useSeoMeta({
  title: () => (props.personal ? '我的个人 Tier 榜' : '共同 Tier 榜设置') + ' · 澄之响',
  robots: 'noindex,nofollow',
})
</script>
<template>
  <div class="experience-page">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">CURATE A SHARED TIER LIST</p>
        <h1>{{ personal ? '我的个人 Tier 榜' : '共同 Tier 榜设置' }}<span>。</span></h1>
        <p>
          {{
            personal
              ? '把自己的分层选择留下，发布后让同好看到你的榜单。'
              : '设置共同榜的分层与作品池，开放后由注册用户参与选择。'
          }}
        </p>
      </div>
      <NuxtLink to="/tiers">查看公开榜单 ↗</NuxtLink>
    </header>
    <template v-if="allowed"
      ><div class="catalog-actions">
        <button class="button primary" :disabled="busy" @click="create">
          {{ personal ? '新建个人 Tier 榜' : '新建 Tier 榜单' }}</button
        ><NuxtLink v-if="!personal" to="/admin/works">去书库收录作品</NuxtLink
        ><button class="button secondary" :disabled="busy" @click="load">刷新榜单列表</button>
      </div>
      <div class="catalog-actions">
        <button
          v-for="list in lists"
          :key="list.id"
          class="button secondary"
          :aria-pressed="form?.id === list.id"
          :disabled="busy"
          @click="select(list)"
        >
          {{ list.title }} · {{ list.isPublished ? '有公开版本' : '草稿' }}
        </button>
      </div>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <p v-if="success" class="form-success" role="status">{{ success }}</p>
      <BangumiSearch
        v-if="form"
        :works="works"
        selectable
        :personal="personal"
        :selecting="busy"
        @selected="addBangumi"
      />
      <form v-if="form" class="experience-card settings-form" @submit.prevent="save('save')">
        <fieldset class="plain-fieldset" :disabled="busy">
          <label class="community-field"
            >榜单标题<input v-model="form.title" required maxlength="80" @input="dirty = true" /></label
          ><label class="community-field"
            >榜单说明<textarea
              v-model="form.description"
              rows="3"
              maxlength="500"
              @input="dirty = true"
            ></textarea>
          </label>
          <p class="catalog-help">
            拖动作品到目标分层，或使用移动选择框及左右按钮排序。保存草稿后再发布，访客才会看到新版本。
          </p>
          <section
            v-for="(row, index) in form.rows"
            :key="row.id"
            class="tier-editor-row"
            :aria-label="row.label + '分层编辑'"
            @dragover.prevent
            @drop.prevent="drop(row)"
          >
            <div class="catalog-actions">
              <input
                v-model="row.label"
                :aria-label="`第${index + 1}层名称`"
                required
                maxlength="24"
                @input="dirty = true"
              /><input
                v-model="row.color"
                type="color"
                :aria-label="`第${index + 1}层颜色`"
                @input="dirty = true"
              /><button
                type="button"
                :disabled="index === 0"
                :aria-label="`上移${row.label}层`"
                @click="reorder(form.rows, index, -1)"
              >
                ↑</button
              ><button
                type="button"
                :disabled="index === form.rows.length - 1"
                :aria-label="`下移${row.label}层`"
                @click="reorder(form.rows, index, 1)"
              >
                ↓</button
              ><button
                type="button"
                :disabled="form.rows.length === 1"
                :aria-label="`删除${row.label}层`"
                @click="removeLevel(row)"
              >
                删除分层
              </button>
            </div>
            <div class="tier-level">
              <div
                class="tier-label"
                :style="{ backgroundColor: row.color, color: tierTextColor(row.color) }"
              >
                {{ row.label }}
              </div>
              <div class="tier-works">
                <article
                  v-for="(id, position) in row.workIds"
                  :key="id"
                  class="tier-work"
                  draggable="true"
                  @dragstart="dragged = id"
                  @dragend="dragged = null"
                >
                  <WorkCover
                    :rank="id"
                    :src="
                      byId.get(id)?.coverUrl ||
                      (id > 12
                        ? byId.get(id)?.bangumi?.coverUrl || '/images/work-placeholder.svg'
                        : undefined)
                    "
                    variant="cover"
                    :alt="(byId.get(id)?.title || '作品') + '封面'"
                    sizes="100px"
                  /><span>{{ byId.get(id)?.title || '作品资料暂不可用' }}</span>
                  <div class="tier-work-controls">
                    <button
                      type="button"
                      :disabled="position === 0"
                      :aria-label="`前移${byId.get(id)?.title}`"
                      @click="reorder(row.workIds, position, -1)"
                    >
                      ←</button
                    ><button
                      type="button"
                      :disabled="position === row.workIds.length - 1"
                      :aria-label="`后移${byId.get(id)?.title}`"
                      @click="reorder(row.workIds, position, 1)"
                    >
                      →</button
                    ><button type="button" :aria-label="`移除${byId.get(id)?.title}`" @click="removeWork(id)">
                      移除</button
                    ><select
                      :value="row.id"
                      :aria-label="`移动${byId.get(id)?.title}到分层`"
                      @change="moveWork(id, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-for="target in form.rows" :key="target.id" :value="target.id">
                        {{ target.label }}
                      </option>
                    </select>
                  </div>
                </article>
                <p v-if="!row.workIds.length" class="catalog-help">将作品拖到这里，或从下方作品池添加。</p>
              </div>
            </div>
          </section>
          <button type="button" class="button secondary" :disabled="form.rows.length >= 20" @click="addLevel">
            添加分层
          </button>
          <h2>作品池</h2>
          <div class="catalog-search">
            <input v-model="search" aria-label="筛选可添加作品" placeholder="搜索书库中的作品" /><select
              v-model="destination"
              aria-label="添加作品的目标分层"
            >
              <option v-for="row in form.rows" :key="row.id" :value="row.id">加入 {{ row.label }} 层</option>
            </select>
          </div>
          <div class="tier-pool">
            <button
              v-for="work in pool"
              :key="work.rank"
              type="button"
              :aria-label="`添加${work.title}到榜单`"
              @click="moveWork(work.rank, destination)"
            >
              ＋ {{ work.title }}
            </button>
            <p v-if="!pool.length" class="catalog-help">没有可添加的匹配作品，可先到书库管理收录。</p>
          </div>
          <p class="catalog-help" role="status">
            {{ dirty ? '有尚未保存的修改。' : '当前编辑内容已保存。'
            }}{{ form.isPublished ? ' 访客可查看上次发布的版本。' : ' 当前榜单尚未公开。' }}
          </p>
          <div class="catalog-actions">
            <button class="button secondary" :disabled="busy">保存草稿</button
            ><button type="button" class="button primary" :disabled="busy" @click="save('publish')">
              发布当前版本</button
            ><button
              v-if="form.isPublished"
              type="button"
              class="button secondary"
              :disabled="busy"
              @click="unpublishOpen = true"
            >
              下架公开榜单</button
            ><NuxtLink v-if="form.isPublished" :to="'/tiers/' + form.id">查看公开版本 ↗</NuxtLink>
          </div>
        </fieldset>
      </form>
      <p v-else class="empty-state">选择已有榜单，或创建一份新的 Tier 榜单。</p>
      <p v-if="form?.blocked" class="form-error" role="alert">该个人榜单已被管理员下架，目前仅可保存草稿。</p>
      <TierModeration v-if="!personal" />
      <ActionDialog
        v-model="unpublishOpen"
        title="下架公开榜单？"
        :message="`下架《${form?.title || ''}》后，访客将无法查看公开版本，草稿仍会保留。`"
        primary="确认下架"
        secondary="暂不下架"
        tone="confirm"
        @primary="save('unpublish')"
      />
    </template>
    <div v-else class="empty-state">
      <p>{{ personal ? '登录后即可制作自己的个人 Tier 榜。' : '需要管理员账号。' }}</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
  </div>
</template>
