<script setup lang="ts">
import type { TierList, TierBallot } from '~/types/catalog'
import type { Work } from '~/types/forum'
import { tierTextColor } from '~/utils/tier-colors'
const props = defineProps<{ list: TierList; works: Work[] }>()
const emit = defineEmits<{ updated: [] }>()
const auth = useAuth(),
  { loginOpen } = useForum()
const mine = ref<TierBallot | null>(null),
  choices = ref<TierBallot['choices']>([])
const busy = ref(false),
  loading = ref(false),
  error = ref(''),
  success = ref(''),
  search = ref('')
const workIds = computed(() => [...new Set(props.list.rows.flatMap((row) => row.workIds))])
const candidates = computed(() =>
  workIds.value
    .map((id) => props.works.find((work) => work.rank === id))
    .filter((work): work is Work => !!work)
    .filter((work) => `${work.title} ${work.subtitle}`.toLowerCase().includes(search.value.toLowerCase())),
)
const dirty = computed(() => JSON.stringify(choices.value) !== JSON.stringify(mine.value?.choices || []))
let revision = 0
async function loadMine() {
  const request = ++revision
  await auth.initialize()
  if (request !== revision) return
  mine.value = null
  choices.value = []
  error.value = ''
  success.value = ''
  const viewer = auth.user.value?.id,
    tier = props.list.id
  if (!viewer) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await auth.request<TierBallot>('/tier-lists/' + tier + '/ballot')
    if (request !== revision || viewer !== auth.user.value?.id || tier !== props.list.id) return
    if (data.publicationKey !== props.list.publicationKey) {
      emit('updated')
      return
    }
    mine.value = data
    choices.value = data.choices.map((choice) => ({ ...choice }))
  } catch (cause) {
    if (request === revision) error.value = (cause as Error).message
  } finally {
    if (request === revision) loading.value = false
  }
}
function choose(workId: number, rowId: string) {
  if (!auth.user.value) {
    loginOpen.value = true
    return
  }
  if (busy.value || loading.value || !mine.value) return
  const selected = choices.value.find((choice) => choice.workId === workId)?.rowId === rowId
  choices.value = choices.value.filter((choice) => choice.workId !== workId)
  if (!selected) choices.value.push({ workId, rowId })
  success.value = ''
  error.value = ''
}
async function save(withdraw = false) {
  if (!auth.user.value) {
    loginOpen.value = true
    return
  }
  if (busy.value || !mine.value) return
  const viewer = auth.user.value.id,
    tier = props.list.id
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    const data = await auth.request<TierBallot & { message: string }>(
      '/tier-lists/' + tier + '/ballot',
      {
        version: mine.value.version,
        publicationKey: props.list.publicationKey,
        choices: withdraw ? [] : choices.value,
      },
      'PUT',
    )
    if (viewer !== auth.user.value?.id || tier !== props.list.id) return
    mine.value = data
    choices.value = data.choices.map((choice) => ({ ...choice }))
    success.value = data.message
    emit('updated')
  } catch (cause) {
    if (viewer === auth.user.value?.id) error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
function count(workId: number, rowId: string) {
  return props.list.stats?.works.find((work) => work.workId === workId)?.counts[rowId] || 0
}
function total(workId: number) {
  return props.list.stats?.works.find((work) => work.workId === workId)?.total || 0
}
onMounted(loadMine)
watch([() => auth.user.value?.id, () => props.list.id, () => props.list.publicationKey], loadMine)
onBeforeUnmount(() => {
  ++revision
})
</script>
<template>
  <section class="tier-voting" aria-labelledby="tier-voting-heading">
    <div class="tier-vote-summary experience-card">
      <div>
        <span class="eyebrow">COMMUNITY CHOICES</span>
        <h2 id="tier-voting-heading">同好们的分层选择</h2>
      </div>
      <p>
        <strong data-testid="tier-participants">{{ list.stats?.participants || 0 }}</strong> 人参与 ·
        {{ workIds.length }} 部作品
      </p>
      <button v-if="!auth.user.value" class="button primary" @click="loginOpen = true">登录后参与分层</button>
    </div>
    <form class="catalog-search" @submit.prevent>
      <label class="sr-only" for="tier-work-query">筛选榜单作品</label
      ><input id="tier-work-query" v-model="search" placeholder="搜索本榜作品名称" />
    </form>
    <p v-if="error" class="form-error" role="alert">
      {{ error }}<button class="text-link" :disabled="busy" @click="loadMine">重新加载我的选择</button>
    </p>
    <p v-if="success" class="form-success" role="status">{{ success }}</p>
    <p v-if="loading" role="status">正在读取你的选择…</p>
    <div class="tier-vote-grid">
      <article
        v-for="work in candidates"
        :key="work.rank"
        class="experience-card tier-vote-card"
        :data-tier-work="work.rank"
      >
        <div class="tier-vote-work">
          <NuxtLink :to="'/works/' + work.rank"
            ><WorkCover
              :rank="work.rank"
              :src="work.rank > 12 ? work.bangumi?.coverUrl || '/images/work-placeholder.svg' : undefined"
              variant="cover"
              :alt="work.title + '封面'"
              sizes="100px"
          /></NuxtLink>
          <div>
            <h3>
              <NuxtLink :to="'/works/' + work.rank">{{ work.title }}</NuxtLink>
            </h3>
            <p class="catalog-help">{{ work.studio }}</p>
            <p class="catalog-help">{{ total(work.rank) }} 人已为这部作品选择分层</p>
            <a
              v-if="work.bangumi"
              :href="`https://bgm.tv/subject/${work.bangumi.id}`"
              target="_blank"
              rel="noopener noreferrer"
              class="text-link"
              >Bangumi ↗</a
            >
          </div>
        </div>
        <div class="tier-vote-options" role="group" :aria-label="work.title + '分层选择'">
          <button
            v-for="row in list.rows"
            :key="row.id"
            :aria-label="`将${work.title}分到${row.label}`"
            :aria-pressed="choices.some((choice) => choice.workId === work.rank && choice.rowId === row.id)"
            :disabled="busy || loading || (!!auth.user.value && !mine)"
            :style="{ '--tier-color': row.color, '--tier-ink': tierTextColor(row.color) }"
            @click="choose(work.rank, row.id)"
          >
            <span>{{ row.label }}</span
            ><strong :data-tier-count="row.id">{{ count(work.rank, row.id) }} 人</strong
            ><span
              class="tier-vote-bar"
              :style="{
                width: total(work.rank) ? `${(count(work.rank, row.id) / total(work.rank)) * 100}%` : '0%',
              }"
            ></span>
          </button>
        </div>
      </article>
    </div>
    <p v-if="!candidates.length" class="empty-state">没有找到匹配的榜单作品。</p>
    <div v-if="auth.user.value" class="tier-ballot-actions experience-card">
      <div>
        <p>我的选择：{{ choices.length }} / {{ workIds.length }} 部作品</p>
        <small class="catalog-help">{{
          dirty
            ? '有尚未提交的修改。'
            : mine?.choices.length
              ? '已提交，可继续修改。'
              : '选择分层后提交，即可计入统计。'
        }}</small>
      </div>
      <div class="catalog-actions">
        <button class="button primary" :disabled="busy || loading || !mine || !dirty" @click="save()">
          {{ busy ? '提交中…' : '提交我的选择' }}</button
        ><button
          class="button secondary"
          :disabled="busy || loading || !mine?.choices.length"
          @click="save(true)"
        >
          撤回我的选择</button
        ><button class="text-link" :disabled="busy || loading" @click="loadMine">重新加载我的选择</button>
      </div>
    </div>
  </section>
</template>
