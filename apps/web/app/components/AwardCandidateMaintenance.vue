<script setup lang="ts">
import type { AwardCandidate, AwardNomination } from '~/types/awards'
import type { BangumiSubject } from '~/types/catalog'
import { nominationDisplayName, toAwardTimeInput, fromAwardTimeInput } from '~/utils/awards'
type RecordEntry = AwardCandidate & { removed: boolean; revision: string }
const props = defineProps<{ campaignId: string }>()
const emit = defineEmits<{ nominators: [nomination: AwardNomination] }>()
const auth = useAuth(),
  awards = useAwards(),
  { notify } = useForum()
const { data: works, refresh: refreshWorks } = useWorkCatalog({ lazy: true, server: false })
const records = ref<RecordEntry[]>([]),
  busy = ref(false),
  loading = ref(false),
  error = ref(''),
  adding = ref(false),
  query = ref(''),
  view = ref('active')
const mode = ref('catalog'),
  workId = ref<number | null>(null),
  subject = ref<BangumiSubject | null>(null)
const form = reactive({
  title: '',
  studio: '',
  reason: '',
  nominatorName: '',
  date: toAwardTimeInput(new Date().toISOString()),
  source: '后台补录',
  informationSource: '',
})
const confirmation = ref<HTMLDialogElement | null>(null),
  target = ref<RecordEntry | null>(null),
  confirmationText = ref(''),
  actionError = ref('')
let revision = 0
const endpoint = computed(() => '/admin/award-campaigns/' + props.campaignId)
const filtered = computed(() =>
  records.value.filter(
    (row) =>
      (view.value === 'all' || row.removed === (view.value === 'removed')) &&
      `${row.title} ${row.studio} ${row.nominations.map(nominationDisplayName).join(' ')}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase()),
  ),
)
async function load() {
  const current = ++revision
  loading.value = true
  try {
    const rows = await auth.request<RecordEntry[]>(endpoint.value + '/candidate-records')
    if (current === revision) records.value = rows
  } catch (cause) {
    if (current === revision) error.value = (cause as Error).message
  } finally {
    if (current === revision) loading.value = false
  }
}
watch(
  () => props.campaignId,
  () => {
    records.value = []
    adding.value = false
    error.value = ''
    confirmation.value?.close()
    void load()
    void refreshWorks()
  },
  { immediate: true },
)
onBeforeUnmount(() => revision++)
function chooseWork() {
  const work = works.value.find((item) => item.rank === workId.value)
  if (work) {
    form.title = work.title
    form.studio = work.studio
    subject.value = null
  }
}
function chooseSubject(payload: { subject: BangumiSubject }) {
  subject.value = payload.subject
  workId.value = null
  form.title = payload.subject.title
  form.studio = payload.subject.studio
}
function changeMode() {
  subject.value = null
  workId.value = null
  form.title = ''
  form.studio = ''
}
async function create() {
  if (busy.value) return
  const date = fromAwardTimeInput(form.date)
  if (!date) {
    error.value = '请填写实际提名时间。'
    return
  }
  if (mode.value === 'catalog' && !workId.value) {
    error.value = '请选择书库作品。'
    return
  }
  if (mode.value === 'bangumi' && !subject.value) {
    error.value = '请选择 Bangumi 作品。'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await auth.request(endpoint.value + '/candidates', {
      title: form.title,
      studio: form.studio,
      reason: form.reason,
      nominatorName: form.nominatorName,
      nominatedAt: date,
      source: form.source,
      informationSource: form.informationSource,
      ...(mode.value === 'catalog'
        ? { workId: workId.value }
        : mode.value === 'bangumi'
          ? { subjectId: subject.value!.id }
          : {}),
    })
    await Promise.all([load(), awards.refresh({ force: true }), refreshWorks()])
    adding.value = false
    notify('候选作品和提名人已补录。')
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
function confirm(row: RecordEntry) {
  target.value = row
  confirmationText.value = ''
  actionError.value = ''
  confirmation.value?.showModal()
}
async function change() {
  if (!target.value || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    const result = await auth.request<{ message: string }>(
      endpoint.value + '/candidates/' + target.value.id + '/status',
      {
        action: target.value.removed ? 'restore' : 'remove',
        revision: target.value.revision,
        confirmation: confirmationText.value,
      },
      'PATCH',
    )
    await Promise.all([load(), awards.refresh({ force: true })])
    confirmation.value?.close()
    notify(result.message)
  } catch (cause) {
    actionError.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function updated() {
  await Promise.all([load(), refreshWorks()])
}
</script>
<template>
  <section class="award-admin-card candidate-maintenance" aria-labelledby="maintenance-title">
    <header>
      <div>
        <p class="eyebrow">SUPER ADMIN</p>
        <h2 id="maintenance-title">提名作品维护</h2>
        <p>各阶段均可补录、修改、移除和恢复。投票中的名单变更实时生效；已公布或归档的分数、排名保持不变。</p>
      </div>
      <button type="button" class="button primary" :disabled="busy" @click="adding = !adding">
        {{ adding ? '收起补录' : '补录候选作品' }}
      </button>
    </header>
    <form v-if="adding" class="maintenance-add" @submit.prevent="create">
      <fieldset class="plain-fieldset" :disabled="busy">
        <label
          >作品来源<select v-model="mode" @change="changeMode">
            <option value="catalog">从书库选择</option>
            <option value="bangumi">搜索 Bangumi</option>
            <option value="manual">手动填写</option>
          </select></label
        >
        <label v-if="mode === 'catalog'"
          >书库作品<select v-model="workId" @change="chooseWork">
            <option :value="null">请选择作品</option>
            <option v-for="work in works" :key="work.rank" :value="work.rank">
              {{ work.title }} · #{{ work.rank }}
            </option>
          </select></label
        >
        <BangumiSearch
          v-if="mode === 'bangumi'"
          :works="works"
          selectable
          :selecting="busy"
          selection-label="选择此作品补录"
          @selected="chooseSubject"
        />
        <label
          >作品名称<input
            v-model="form.title"
            required
            maxlength="160"
            :readonly="mode !== 'manual'" /></label
        ><label
          >制作组／会社<input v-model="form.studio" maxlength="200" :readonly="mode === 'catalog'"
        /></label>
        <label
          >作品资料来源<input
            v-model="form.informationSource"
            maxlength="300"
            placeholder="Bangumi、官网链接或核对说明" /></label
        ><label>提名人<input v-model="form.nominatorName" required maxlength="64" /></label
        ><label>实际提名时间（北京时间）<input v-model="form.date" type="datetime-local" required /></label
        ><label>提名渠道<input v-model="form.source" maxlength="80" placeholder="例如：QQ群、网站" /></label
        ><label>提名词<textarea v-model="form.reason" maxlength="600" rows="3" /></label>
        <p>补录直接作为已通过提名。公布后补录的作品只更新资料列表，不添加历史分数。</p>
        <button type="submit" class="button primary">{{ busy ? '正在补录…' : '保存候选作品' }}</button>
      </fieldset>
    </form>
    <div class="maintenance-filter">
      <label>搜索作品或提名人<input v-model="query" type="search" placeholder="搜索维护记录" /></label
      ><label
        >记录状态<select v-model="view">
          <option value="active">当前候选</option>
          <option value="removed">已移除</option>
          <option value="all">全部记录</option>
        </select></label
      ><button type="button" class="button secondary" :disabled="loading || busy" @click="load">
        刷新记录
      </button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">正在加载维护记录…</p>
    <p v-else-if="!filtered.length">没有匹配的作品。</p>
    <article v-for="row in filtered" :key="row.id" class="maintenance-record">
      <div>
        <h3>
          {{ row.title }}<span>{{ row.removed ? '已移除' : '当前候选' }}</span>
        </h3>
        <p>{{ row.studio || '制作组待补充' }} · 关联书库 #{{ row.coverRank || '待补全' }}</p>
        <p>
          提名人：{{
            row.nominations
              .filter((n) => !n.deletedAt || row.removed)
              .map(nominationDisplayName)
              .join('、')
          }}
        </p>
        <p v-if="row.nominations.some((n) => n.informationSource)">
          资料来源：{{ row.nominations.find((n) => n.informationSource)?.informationSource }}
        </p>
      </div>
      <div class="maintenance-record-actions">
        <template v-if="!row.removed"
          ><AwardCandidateEditor
            :candidate="row"
            :campaign-id="campaignId"
            :catalog="works"
            @updated="updated"
          /><button
            type="button"
            class="button secondary"
            :disabled="busy"
            @click="
              emit(
                'nominators',
                row.nominations.find((n) => !n.deletedAt)!,
              )
            "
          >
            编辑提名人和提名渠道
          </button></template
        ><button type="button" class="button secondary" :disabled="busy" @click="confirm(row)">
          {{ row.removed ? '恢复候选作品' : '移除候选作品' }}
        </button>
      </div>
    </article>
    <dialog
      ref="confirmation"
      class="modal maintenance-confirm"
      aria-labelledby="maintenance-confirm-title"
      @cancel.prevent="!busy && confirmation?.close()"
    >
      <h2 id="maintenance-confirm-title">{{ target?.removed ? '恢复' : '移除' }}候选作品</h2>
      <p>
        原始选票保留；已公布的榜单分数和排名保持不变。{{
          target?.removed
            ? '仅恢复本次整作移除的提名记录。'
            : '作品会从当前候选列表移除，投票阶段不再接受新的投票。'
        }}
      </p>
      <form @submit.prevent="change">
        <label
          >输入完整作品名称确认<input
            v-model="confirmationText"
            :placeholder="target?.title"
            required
            :disabled="busy"
        /></label>
        <p v-if="actionError" role="alert" class="form-error">{{ actionError }}</p>
        <footer>
          <button type="button" class="button secondary" :disabled="busy" @click="confirmation?.close()">
            取消</button
          ><button
            type="submit"
            class="button primary"
            :disabled="busy || confirmationText !== target?.title"
          >
            确认{{ target?.removed ? '恢复' : '移除' }}
          </button>
        </footer>
      </form>
    </dialog>
  </section>
</template>
<style scoped>
.candidate-maintenance {
  padding: 24px;
}
.candidate-maintenance > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.candidate-maintenance h2 {
  font-family: var(--serif);
  font-size: 26px;
}
.candidate-maintenance p {
  font-size: 14px;
  line-height: 1.8;
  color: var(--subtle);
  overflow-wrap: anywhere;
}
.candidate-maintenance label {
  display: grid;
  min-width: 0;
  gap: 8px;
  font-size: 15px;
}
.candidate-maintenance input,
.candidate-maintenance textarea,
.candidate-maintenance select {
  min-width: 0;
  width: 100%;
  min-height: 48px;
  padding: 12px 16px;
  font-size: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--bg);
}
.candidate-maintenance .button {
  min-height: 44px;
  font-size: 14px;
  border-radius: 999px;
}
.maintenance-add {
  margin-top: 24px;
  max-width: 760px;
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 20px;
}
.maintenance-add fieldset {
  min-width: 0;
  display: grid;
  gap: 16px;
}
.maintenance-filter {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
  margin: 24px 0;
}
.maintenance-filter > label:first-child {
  flex: 1;
  min-width: 180px;
}
.maintenance-record {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 20px 0;
  border-top: 1px solid var(--line);
}
.maintenance-record h3 {
  font-family: var(--serif);
  font-size: 21px;
  overflow-wrap: anywhere;
}
.maintenance-record h3 > span {
  font-family: var(--sans);
  font-size: 12px;
  margin-left: 10px;
  color: var(--orange);
}
.maintenance-record-actions {
  display: grid;
  gap: 10px;
  align-content: start;
  min-width: 200px;
}
.maintenance-confirm {
  width: min(560px, calc(100vw - 32px));
  padding: 28px;
  border-radius: 24px;
}
.maintenance-confirm h2 {
  font-size: 24px;
}
.maintenance-confirm form {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}
.maintenance-confirm footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.candidate-maintenance .form-error {
  color: var(--orange);
}
@media (max-width: 699px) {
  .candidate-maintenance {
    padding: 16px;
  }
  .candidate-maintenance > header {
    flex-wrap: wrap;
  }
  .maintenance-record {
    grid-template-columns: 1fr;
  }
  .maintenance-filter {
    align-items: stretch;
    flex-direction: column;
  }
  .maintenance-record-actions {
    grid-template-columns: 1fr;
  }
}
</style>
