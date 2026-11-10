<script setup lang="ts">
import { coverUrl as archiveCoverUrl } from '~/data/forum'
import { ballotRules, phaseNames, formatAwardTime, formatNominationTime, nominationDisplayName, campaignWindowMessage, normalizeWorkTitle } from '~/utils/awards'
import type { AwardCandidate } from '~/types/awards'
import type { Work } from '~/types/forum'
import type { BangumiSubject } from '~/types/catalog'

const api = useRequestFetch()
const { data: works, refresh: refreshWorks, error: catalogError } = await useAsyncData('award-catalog', () => api<Work[]>('/api/works'), { default: () => [] })
const sourceMode = ref('catalog')
const selectedWorkId = ref<number | null>(null)
const selectedSubject = ref<BangumiSubject | null>(null)
const submitting = ref(false)
const auth = useAuth()
const nominationCover = ref<{ id: string; url: string; name: string } | null>(null)
const nominationCoverInput = ref<HTMLInputElement | null>(null)
const uploadingCover = ref(false)
let coverUploadVersion = 0
const manualExistingWork = computed(() => {
  const key = normalizeWorkTitle(formTitle.value)
  return key ? works.value.find((work) => [work.title, work.subtitle, work.bangumi?.title, work.bangumi?.originalTitle].some((title) => title && normalizeWorkTitle(title) === key)) : undefined
})
const selectedWork = computed(() => works.value.find((work) => work.rank === selectedWorkId.value))
function coverUrl(rank: number) {
  const work = works.value.find((item) => item.rank === rank)
  return work?.coverUrl || work?.bangumi?.coverUrl || (rank <= 12 ? archiveCoverUrl(rank) : '/images/work-placeholder.svg')
}
function chooseWork() {
  selectedSubject.value = null
  formTitle.value = selectedWork.value?.title || ''
  formStudio.value = selectedWork.value?.studio || ''
}
function chooseBangumi({ subject }: { subject: BangumiSubject }) {
  const keys = [subject.title, subject.originalTitle].map(normalizeWorkTitle).filter(Boolean)
  const existing = works.value.find((work) => work.bangumi?.id === subject.id || [work.title, work.subtitle, work.bangumi?.title, work.bangumi?.originalTitle].some((title) => title && keys.includes(normalizeWorkTitle(title))))
  selectedWorkId.value = existing?.rank || null
  selectedSubject.value = existing ? null : subject
  formTitle.value = existing?.title || subject.title
  formStudio.value = existing?.studio || subject.studio
  formError.value = ''
}
function changeSource() {
  coverUploadVersion++
  nominationCover.value = null
  selectedWorkId.value = null
  selectedSubject.value = null
  formTitle.value = ''
  formStudio.value = ''
  formError.value = ''
}

const awards = useAwards()
const route = useRoute()
const activityReady = ref(false)
async function loadActivity() {
  activityReady.value = false
  const requested = route.query.campaign
  if (typeof requested === 'string') awards.selectedCampaignId.value = requested
  await awards.initialize()
  activityReady.value = true
}
const identity = usePreviewIdentity()
const { campaign, campaigns, selectedCampaignId, visibleCandidates: candidates, myNominations, myBallot, results } = awards
const { notify } = useForum()
const tab = ref('candidates')
const search = ref('')
const selected = ref<string[]>([])
const nominationDialog = ref<HTMLDialogElement | null>(null)
const formTitle = ref('')
const formStudio = ref('')
const formReason = ref('')
const formError = ref('')
watch(manualExistingWork, (work) => {
  if (sourceMode.value === 'manual') selectedWorkId.value = work?.rank || null
  if (work) nominationCover.value = null
})
const ballotError = ref('')
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined

onMounted(async () => {
  await loadActivity()
  clock = setInterval(() => {
    now.value = Date.now()
    if (!document.hidden) void awards.refresh().catch(() => {})
  }, 15000)
})
onBeforeUnmount(() => {
  coverUploadVersion++
  if (clock) clearInterval(clock)
})
watch(
  [myBallot, selectedCampaignId, identity.selectedId],
  () => {
    selected.value = [...(myBallot.value?.candidateIds || [])]
    ballotError.value = ''
    search.value = ''
  },
  { immediate: true, deep: true },
)
const nominationCount = computed(
  () => myNominations.value.filter((item) => item.status !== 'rejected').length,
)
const availableCandidates = computed(() =>
  candidates.value.filter((candidate) =>
    `${candidate.title} ${candidate.studio}`.toLowerCase().includes(search.value.trim().toLowerCase()),
  ),
)
const nominationWindow = computed(() => campaignWindowMessage(campaign.value, 'nomination', now.value))
const votingWindow = computed(() => campaignWindowMessage(campaign.value, 'voting', now.value))
const canNominate = computed(() => campaign.value.phase === 'nomination' && !nominationWindow.value)
const canVote = computed(() => campaign.value.phase === 'voting' && !votingWindow.value)
const rules = computed(() => ballotRules(campaign.value))
const weighted = computed(() => campaign.value.votingRule === 'weighted-v1')
const ended = computed(() => ['results', 'archived'].includes(campaign.value.phase))
const resultById = computed(() => new Map(results.value.map((item) => [item.id, item])))
const qualifiedCount = computed(() => results.value.filter((item) => item.votes > 0).length)
const isLocked = (id: string) => !!campaign.value.lockedCandidateIds?.includes(id)
const winners = computed(() =>
  results.value.filter((item) => item.votes > 0 && item.rank <= campaign.value.winnerCount),
)
const title = computed(() =>
  campaign.value.phase === 'voting'
    ? ['把你的喜欢，', '交给这一票。']
    : ended.value
      ? ['每一份喜欢，', '都有了回响。']
      : ['把你的那一部，', '提名给所有人。'],
)
const phaseIndex = computed(() =>
  campaign.value.phase === 'draft'
    ? -1
    : campaign.value.phase === 'nomination'
      ? 0
      : campaign.value.phase === 'voting'
        ? 1
        : 2,
)
const statusNames = { pending: '待审核', approved: '已通过', rejected: '已退回', withdrawn: '已撤回' }
const ballotChanged = computed(
  () =>
    JSON.stringify([...selected.value].sort()) !==
    JSON.stringify([...(myBallot.value?.candidateIds || [])].sort()),
)
useSeoMeta({ title: () => activityReady.value?`${campaign.value.title} · 澄之响`:'十二橙器活动 · 澄之响' })

function selectEdition() {
  selected.value = []
  tab.value = 'candidates'
  awards.persist()
}
function openNomination(title = '', studio = '') {
  if (!canNominate.value) {
    notify(nominationWindow.value || '活动尚未开放提名，请留意后续公告。')
    return
  }
  formTitle.value = title
  formStudio.value = studio
  formReason.value = ''
  formError.value = ''
  nominationCover.value = null
  coverUploadVersion++
  selectedWorkId.value = works.value.find((work) => normalizeWorkTitle(work.title) === normalizeWorkTitle(title))?.rank || null
  selectedSubject.value = null
  sourceMode.value = title ? 'manual' : 'catalog'
  nominationDialog.value?.showModal()
  void refreshWorks()
}
async function submitNomination() {
  if (submitting.value || uploadingCover.value) return
  if (sourceMode.value === 'catalog' && !selectedWork.value) { formError.value = '请先选择书库作品。'; return }
  if (sourceMode.value === 'bangumi' && !selectedWork.value && !selectedSubject.value) { formError.value = '请先搜索并选择 Bangumi 作品。'; return }
  submitting.value = true
  try {
    await awards.submitNomination(formTitle.value, formStudio.value, formReason.value, {
      ...(sourceMode.value !== 'manual' && selectedWorkId.value ? { workId: selectedWorkId.value } : {}),
      ...(selectedSubject.value ? { subjectId: selectedSubject.value.id } : {}),
      ...(sourceMode.value === 'manual' && !manualExistingWork.value && nominationCover.value ? { coverAssetId: nominationCover.value.id } : {}),
    })
    await refreshWorks()
    nominationDialog.value?.close()
    tab.value = 'mine'
    notify('提名已提交，等待管理员审核。')
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '提名提交失败。'
  } finally {
    submitting.value = false
  }
}
async function uploadNominationCover(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || submitting.value || uploadingCover.value) return
  formError.value = ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    formError.value = '封面请选择 JPG、PNG 或 WebP，最大 5 MB。'
    return
  }
  uploadingCover.value = true
  const uploadVersion = ++coverUploadVersion
  try {
    const data = new FormData()
    data.append('file', file)
    const uploaded = await auth.request<{ id: string; url: string }>('/uploads', data)
    if (uploadVersion === coverUploadVersion && sourceMode.value === 'manual' && !manualExistingWork.value && nominationDialog.value?.open)
      nominationCover.value = { ...uploaded, name: file.name }
  } catch (error) {
    if (uploadVersion === coverUploadVersion)
      formError.value = error instanceof Error ? error.message : '封面上传失败，请重试。'
  } finally {
    uploadingCover.value = false
  }
}
async function withdraw(id: string) {
  try {
    await awards.withdrawNomination(id)
    notify('已撤回这条提名，可以重新提交。')
  } catch (error) {
    notify(error instanceof Error ? error.message : '暂时无法撤回。')
  }
}
function toggleCandidate(candidate: AwardCandidate, event: Event) {
  const input = event.target as HTMLInputElement
  if (!canVote.value) {
    input.checked = selected.value.includes(candidate.id)
    return
  }
  ballotError.value = ''
  if (selected.value.includes(candidate.id))
    selected.value = selected.value.filter((id) => id !== candidate.id)
  else if (selected.value.length < campaign.value.voteLimit) selected.value.push(candidate.id)
  else ballotError.value = `本届每人最多选择 ${campaign.value.voteLimit} 部作品。`
  input.checked = selected.value.includes(candidate.id)
}
async function submitBallot() {
  try {
    await awards.saveBallot(selected.value)
    ballotError.value = ''
    notify('选票已保存。投票结束前可以修改并重新提交。')
  } catch (error) {
    ballotError.value = error instanceof Error ? error.message : '选票提交失败。'
  }
}
async function withdrawBallot() {
  try {
    await awards.withdrawBallot()
    selected.value = []
    notify('已撤回本人选票。')
  } catch (error) {
    ballotError.value = error instanceof Error ? error.message : '暂时无法撤回。'
  }
}
</script>

<template>
  <div v-if="!activityReady" class="empty-state" role="status">正在加载活动…</div>
  <div v-else-if="!awards.online.value" class="empty-state" role="alert"><p>活动暂时未能加载。</p><button class="button secondary" @click="loadActivity">重新加载活动</button></div>
  <div v-else class="awards-page">
    <p v-if="!campaigns.length && awards.online.value" class="empty-state">
      暂无开放的活动，欢迎关注后续投票。
    </p>
    <template v-if="campaigns.length"
      ><div class="award-page-top">
        <span class="page-kicker"
          ><span class="category-dot orange"></span> THE TWELVE ORANGES · COMMUNITY AWARDS</span
        ><label class="award-edition-select"
          ><span class="sr-only">选择活动届次</span
          ><select v-model="selectedCampaignId" @change="selectEdition">
            <option v-for="item in campaigns" :key="item.id" :value="item.id">
              第 {{ item.edition }} 届 · {{ phaseNames[item.phase] }}
            </option>
          </select></label
        >
      </div>
      <section class="award-hero">
        <div>
          <div class="award-hero-label">
            <span class="award-edition-pill">第 {{ campaign.edition }} 届十二橙器</span
            ><span class="award-phase-dot"
              ><span class="status-dot"></span>{{ phaseNames[campaign.phase] }}</span
            >
          </div>
          <h1>
            {{ title[0] }}<br /><span>{{ title[1] }}</span>
          </h1>
          <p>由同好提名，用喜欢投票。<br />一起写下属于澄之响的新一届视觉小说书单。</p>
          <div class="award-hero-actions">
            <button v-if="canNominate" class="button primary" @click="openNomination()">
              <AppIcon name="plus" :size="17" />提名我喜欢的作品</button
            ><a v-else-if="canVote" href="#award-candidates" class="button primary"
              >为喜欢的作品投票<AppIcon name="arrowRight" :size="17" /></a
            ><a v-else-if="ended" href="#award-results" class="button primary"
              >查看本届结果<AppIcon name="trophy" :size="17" /></a
            ><span v-else class="award-pending-text"
              ><AppIcon name="calendar" :size="17" />{{
                campaign.phase === 'voting'
                  ? votingWindow || '投票时间待公布'
                  : nominationWindow || '提名时间待公布'
              }}</span
            ><NuxtLink to="/ranking" class="text-link"
              >回顾第一届<AppIcon name="arrowUpRight" :size="16"
            /></NuxtLink>
          </div>
        </div>
        <div class="award-hero-art" aria-hidden="true">
          <span class="award-huge-number">{{ String(campaign.edition).padStart(2, '0') }}</span
          ><span class="award-art-leaf"><DecorativeSpark /></span>
          <div class="award-art-seal">
            <AppIcon name="trophy" :size="42" /><span>NOMINATE.<br />VOTE. RESONATE.</span>
          </div>
          <span class="award-art-foot">YOUR FAVOURITE STORY DESERVES TO BE SEEN.</span>
        </div>
      </section>
      <div class="award-prototype-notice">
        <AppIcon name="info" :size="15" /><span>提名与选票由服务器保存，投票结束后统一公布结果。</span
        ><NuxtLink v-if="identity.can('campaign.manage')" to="/admin/awards"
          >管理活动<AppIcon name="arrowUpRight" :size="14"
        /></NuxtLink>
      </div>
      <ol class="award-stepper" aria-label="活动流程">
        <li
          v-for="(label, index) in ['提名阶段', '投票阶段', '结果公布']"
          :key="label"
          :class="{ current: phaseIndex === index, complete: phaseIndex > index }"
        >
          <span class="award-step-number"
            ><AppIcon v-if="phaseIndex > index" name="check" :size="17" /><template v-else>{{
              String(index + 1).padStart(2, '0')
            }}</template></span
          >
          <div>
            <strong>{{ label }}</strong
            ><span>{{
              index === 0
                ? campaign.nominationStart
                  ? `${formatAwardTime(campaign.nominationStart)} — ${formatAwardTime(campaign.nominationEnd)}`
                  : '时间待公布'
                : index === 1
                  ? campaign.votingStart
                    ? `${formatAwardTime(campaign.votingStart)} — ${formatAwardTime(campaign.votingEnd)}`
                    : '时间待公布'
                  : '投票结束后，由管理员公布'
            }}</span>
          </div>
        </li>
      </ol>
      <div class="awards-layout">
        <div class="award-main">
          <section v-if="campaign.phase === 'voting'" class="award-live-summary" aria-label="投票进度">
            <h2>{{ campaign.votingRound === 2 ? '二次投票 · 补足入选名额' : '首轮投票' }}</h2>
            <p>有效得分作品 {{ qualifiedCount }} / {{ campaign.winnerCount }} 部 · 分数每 15 秒更新。</p>
            <p v-if="campaign.votingRound === 2">首轮 {{ campaign.lockedCandidateIds?.length || 0 }} 部已得分作品保留，仅可对其余已提名作品补投。</p>
            <p v-if="campaign.votingRound === 2 && !awards.votingCandidates.value.length" role="status">所有提名作品均已得分，目前没有可补投的作品。现有提名不足计划名额时，最终只能公布实际有效作品。</p>
            <button class="button secondary" @click="awards.initialize">刷新分数</button>
          </section>
          <section v-if="ended" id="award-results" class="award-results-section">
            <div class="section-heading">
              <div>
                <p class="eyebrow">THE STORIES YOU CHOSE</p>
                <h2>本届的共同选择<span class="heading-dot">。</span></h2>
              </div>
              <span class="muted">{{ awards.ballotCount.value }} 份选票</span>
            </div>
            <div v-if="!winners.length" class="empty-state">
              <AppIcon name="trophy" :size="30" />
              <h3>本届还没有有效得票结果</h3>
              <p>不会用示例票数生成正式排名。</p>
            </div>
            <div v-else class="award-result-list">
              <article v-for="item in winners" :key="item.id" class="award-result-row">
                <span class="award-result-rank">{{ String(item.rank).padStart(2, '0') }}</span>
                <div class="award-result-cover">
                  <SafeImage
                    v-if="item.coverRank"
                    :src="coverUrl(item.coverRank)"
                    :alt="`${item.title}封面`"
                  /><AppIcon v-else name="book" :size="25" />
                </div>
                <div>
                  <h3>{{ item.title }}</h3>
                  <span
                    >{{ item.studio || '成员提名作品'
                    }}<small v-if="weighted">
                      · 真爱 {{ item.loveVotes || 0 }} · 喜爱 {{ item.likeVotes || 0 }} · 推荐词
                      {{ item.recommendationCount || 0 }}</small
                    ><span v-if="winners.filter((other) => other.votes === item.votes).length > 1">
                      · 同票并列</span
                    ></span
                  >
                </div>
                <strong
                  >{{ item.votes }}<small>{{ weighted ? '分' : '票' }}</small></strong
                >
              </article>
            </div>
            <p class="award-small-note">
              同票作品按相同名次并列展示；入选名额边界出现同票时，入选数量可能超过计划名额。
            </p>
            <p v-if="qualifiedCount < campaign.winnerCount" class="award-small-note">已完成二次投票，有效得分作品共 {{ qualifiedCount }} 部，少于计划的 {{ campaign.winnerCount }} 部；按实际结果公布。</p>
          </section>
          <section id="award-candidates">
            <div class="section-heading">
              <div>
                <p class="eyebrow">OUR NEXT COLLECTIVE MEMORY</p>
                <h2>
                  {{
                    ended
                      ? '所有提名的故事'
                      : campaign.phase === 'voting'
                        ? '正式候选名单'
                        : '这一次，为喜欢提名'
                  }}<span class="heading-dot">。</span>
                </h2>
              </div>
              <span class="award-candidate-total">{{ candidates.length }} 部{{ campaign.phase === 'nomination' ? '已提名作品（含待审核）' : '正式候选作品' }}</span>
            </div>
            <div class="award-board-toolbar">
              <div class="award-tabs" role="group" aria-label="活动列表">
                <button
                  :class="{ active: tab === 'candidates' }"
                  :aria-pressed="tab === 'candidates'"
                  @click="tab = 'candidates'"
                >
                  候选作品</button
                ><button
                  :class="{ active: tab === 'mine' }"
                  :aria-pressed="tab === 'mine'"
                  @click="tab = 'mine'"
                >
                  我的提名 <span>{{ myNominations.length }}</span></button
                ><button
                  :class="{ active: tab === 'ballot' }"
                  :aria-pressed="tab === 'ballot'"
                  @click="tab = 'ballot'"
                >
                  我的选票
                </button>
              </div>
              <label v-if="tab === 'candidates'" class="award-search"
                ><AppIcon name="search" :size="15" /><input
                  v-model="search"
                  placeholder="搜索候选作品"
                  aria-label="搜索候选作品"
              /></label>
            </div>
            <template v-if="tab === 'candidates'"
              ><div v-if="!availableCandidates.length" class="empty-state award-empty">
                <span class="award-empty-spark"><DecorativeSpark /></span>
                <h3>
                  {{
                    search
                      ? '没有找到这部作品'
                      : campaign.phase === 'draft'
                        ? '下一届故事，正在准备中'
                        : '第一份提名，也许就来自你'
                  }}
                </h3>
                <p>
                  {{
                    search
                      ? '换个关键词试试。'
                      : campaign.phase === 'draft'
                        ? '名额和时间由管理员确认后公布，先翻翻第一届的书单吧。'
                        : '提交的提名会公开展示并署名，审核通过后进入正式投票名单。'
                  }}
                </p>
                <button v-if="canNominate" class="button secondary" @click="openNomination()">
                  提交一份提名<AppIcon name="plus" :size="15" /></button
                ><NuxtLink v-else-if="campaign.phase === 'draft'" to="/ranking" class="button secondary"
                  >回顾第一届书单<AppIcon name="arrowUpRight" :size="15"
                /></NuxtLink>
              </div>
              <div v-else class="award-candidate-grid">
                <article
                  v-for="item in availableCandidates"
                  :key="item.id"
                  class="award-candidate-card"
                  :class="{ chosen: selected.includes(item.id) && campaign.phase === 'voting' }"
                >
                  <div class="award-candidate-cover">
                    <SafeImage
                      v-if="item.coverRank"
                      :src="coverUrl(item.coverRank)"
                      :alt="`${item.title}封面`"
                      loading="lazy"
                    />
                    <div v-else class="award-no-cover">
                      <AppIcon name="book" :size="32" /><span>每一个故事，都有它的位置。</span>
                    </div>
                    <span class="award-nomination-count">{{ item.nominations.length }} 次提名</span>
                  </div>
                  <div class="award-candidate-copy">
                    <span>{{ item.studio || '成员推荐' }}</span>
                    <h3>{{ item.title }}</h3>
                    <p>{{ item.nominations[0]?.reason }}</p>
                    <p v-if="campaign.phase === 'voting' || ended" class="award-live-score">{{ resultById.get(item.id)?.votes || 0 }} {{ weighted ? '分' : '票' }}<span v-if="isLocked(item.id)"> · 首轮已保留</span></p>
                    <details class="award-public-details">
                      <summary>提名人：{{ item.nominations.map(nominationDisplayName).join('、') }}</summary>
                      <div v-for="n in item.nominations" :key="n.id"><strong>{{ nominationDisplayName(n) }}</strong> · {{ statusNames[n.status] }}<time>{{ formatNominationTime(n) }}<span v-if="n.qqSync"> · QQ群提名</span></time><p v-if="n.reason">{{ n.reason }}</p></div>
                    </details>
                    <details v-if="awards.recommendations.value.some((rec) => rec.candidateId === item.id)" class="award-public-details">
                      <summary>查看署名推荐词（{{ awards.recommendations.value.filter((rec) => rec.candidateId === item.id).length }}）</summary>
                      <div v-for="(rec, index) in awards.recommendations.value.filter((rec) => rec.candidateId === item.id)" :key="index"><strong>{{ rec.authorName }}</strong> · 第 {{ rec.round }} 轮<p>{{ rec.text }}</p></div>
                    </details>
                    <label v-if="campaign.phase === 'voting' && !weighted" class="award-vote-choice"
                      ><input
                        type="checkbox"
                        :checked="selected.includes(item.id)"
                        :disabled="!canVote || isLocked(item.id)"
                        :aria-label="`投票给${item.title}`"
                        @change="toggleCandidate(item, $event)"
                      /><span>{{ selected.includes(item.id) ? '已加入选票' : '选入我的选票' }}</span></label
                    ><button
                      v-else-if="canNominate"
                      class="text-link"
                      @click="openNomination(item.title, item.studio)"
                    >
                      我也想提名<AppIcon name="plus" :size="14" />
                    </button>
                  </div>
                </article></div
            ></template>
            <template v-else-if="tab === 'mine'"
              ><div v-if="!myNominations.length" class="empty-state">
                <AppIcon name="pen" :size="28" />
                <h3>让你的喜欢，被更多人看见</h3>
                <p>本届每人可提名 {{ campaign.nominationLimit }} 部作品，提交后由管理员审核。</p>
                <button v-if="canNominate" class="button secondary" @click="openNomination()">
                  写下第一份提名<AppIcon name="plus" :size="15" />
                </button>
              </div>
              <div v-else class="award-my-nominations">
                <article v-for="item in myNominations" :key="item.id">
                  <div class="award-my-nomination-top">
                    <h3>{{ item.title }}</h3>
                    <span :class="['award-status', item.status]">{{ statusNames[item.status] }}</span>
                  </div>
                  <p>{{ item.reason }}</p>
                  <p v-if="item.reviewNote" class="award-review-note">管理员反馈：{{ item.reviewNote }}</p>
                  <div>
                    <span>{{ formatNominationTime(item) }}{{ item.qqSync ? ' · QQ群提名' : '' }}</span
                    ><button v-if="canNominate && item.status !== 'rejected'" @click="withdraw(item.id)">
                      撤回提名</button
                    ><button
                      v-if="canNominate && item.status === 'rejected'"
                      @click="openNomination(item.title, item.studio)"
                    >
                      修改后重新提名
                    </button>
                  </div>
                </article>
              </div></template
            >
            <template v-else-if="!weighted"
              ><div v-if="!myBallot" class="empty-state">
                <AppIcon name="check" :size="28" />
                <h3>你的这一票，还在等候</h3>
                <p>
                  {{
                    campaign.phase === 'voting'
                      ? '到候选名单选择喜欢的作品，再提交你的选票。'
                      : '投票开放后，可以在这里查看已提交的选票。'
                  }}
                </p>
                <button v-if="canVote" class="button secondary" @click="tab = 'candidates'">
                  去选择作品<AppIcon name="arrowRight" :size="15" />
                </button>
              </div>
              <div v-else class="award-ballot-receipt">
                <div>
                  <span class="award-ballot-check"><AppIcon name="check" :size="24" /></span>
                  <h3>你的喜欢，已经收到。</h3>
                  <p>
                    共选择 {{ myBallot.candidateIds.length }} 部作品 ·
                    {{ formatAwardTime(myBallot.updatedAt) }}
                  </p>
                </div>
                <ul>
                  <li v-for="id in myBallot.candidateIds" :key="id">
                    <AppIcon name="book" :size="16" />{{
                      candidates.find((item) => item.id === id)?.title || '候选作品'
                    }}
                  </li>
                </ul>
                <button v-if="canVote" class="text-link" @click="tab = 'candidates'">
                  修改我的选票<AppIcon name="pen" :size="15" />
                </button>
                <p v-else class="award-small-note">本阶段选票已锁定，无法再修改。</p>
              </div></template
            >
          </section>
          <WeightedAwardBallot
            v-if="weighted && (campaign.phase === 'voting'||tab==='ballot')"
              :key="campaign.id + ':' + (campaign.votingRound || 1)"
              :enabled="canVote && awards.votingCandidates.value.length > 0"
          />
          <section
            v-if="campaign.phase === 'voting' && !weighted"
            class="award-ballot-bar"
            aria-label="我的当前选票"
          >
            <div>
              <strong
                >已选 {{ selected.length }}<span>/ {{ campaign.voteLimit }} 部</span></strong
              >
              <p>
                {{
                  myBallot
                    ? ballotChanged
                      ? '选票已修改，请重新提交保存。'
                      : '已提交，投票结束前仍可修改。'
                    : '每部作品一票，不必用满名额。'
                }}
              </p>
            </div>
            <div>
              <button v-if="myBallot && canVote" class="award-text-button" @click="withdrawBallot">
                撤回选票</button
              ><button
                v-else
                class="award-text-button"
                :disabled="!selected.length"
                @click="
                  selected = []; ballotError = ''
                "
              >
                清空选择</button
              ><button
                class="button primary"
                :disabled="!canVote || !selected.length || (!!myBallot && !ballotChanged)"
                @click="submitBallot"
              >
                {{ myBallot ? '保存选票修改' : '提交我的选票' }}<AppIcon name="send" :size="16" />
              </button>
            </div>
            <p v-if="ballotError || votingWindow" class="form-error" role="alert">
              {{ ballotError || votingWindow }}
            </p>
          </section>
        </div>
        <aside class="award-rail">
          <section id="award-rules" class="rail-card award-rule-card">
            <p class="eyebrow">HOW TO JOIN</p>
            <h2>这届，怎么参与？</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>提名喜欢的作品</strong>
                  <p>
                    每人最多
                    {{
                      campaign.nominationLimit
                    }}
                    部，说明可不填。审核通过后进入候选名单；投票时可为自己投票的作品另写计分推荐词。
                  </p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>为心中的作品投票</strong>
                  <p>
                    <template v-if="weighted"
                      >欢迎投票！真爱票最多 {{ rules.loveLimit }} 张、各 {{ rules.lovePoints }} 分，喜爱票最多
                      {{ rules.likeLimit }} 张、各
                      {{ rules.likePoints }} 分，作品不得重复；推荐词选填，每个已投作品最多一份，各额外加
                      {{ rules.recommendationPoints }} 分，每人最多
                      {{ rules.recommendationLimit }} 份。以最后提交为准。</template
                    ><template v-else
                      >每人最多选
                      {{ campaign.voteLimit }} 部，每部一票。投票结束前可修改，以最后提交为准。</template
                    >
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>一起见证新书单</strong>
                  <p>计划选出 {{ campaign.winnerCount }} 部作品，同分并列。</p>
                </div>
              </li>
            </ol>
            <p class="award-rule-footer">
              名额与时间由管理员配置。所有提名默认需审核，当前日期与时间均按 UTC+8 显示。
            </p>
          </section>
          <section class="rail-card award-my-progress">
            <h2>我的参与进度</h2>
            <div>
              <span>本届提名</span><strong>{{ nominationCount }} / {{ campaign.nominationLimit }}</strong>
            </div>
            <div>
              <span>我的选票</span><strong>{{ myBallot ? '已提交' : '未提交' }}</strong>
            </div>
            <span class="award-identity-label"
              >{{ identity.account.value.name }} · {{ identity.roleNames[identity.role.value] }}</span
            >
          </section>
          <NuxtLink to="/ranking" class="award-archive-card"
            ><span class="eyebrow">PREVIOUS EDITION</span>
            <h2>第一届十二橙器</h2>
            <p>那些被共同喜欢过的故事。</p>
            <div class="award-archive-covers">
              <img
                v-for="rank in [1, 2, 3]"
                :key="rank"
                :src="coverUrl(rank)"
                alt="第一届入选作品封面"
                loading="lazy"
              />
            </div>
            <span class="text-link">翻开已公布的结果<AppIcon name="arrowUpRight" :size="15" /></span
          ></NuxtLink>
        </aside>
      </div>
      <dialog ref="nominationDialog" class="modal award-nomination-dialog" aria-labelledby="nomination-title">
        <div class="modal-heading">
          <div>
            <p class="eyebrow">A STORY WORTH SHARING</p>
            <h2 id="nomination-title">替喜欢的作品，写一封推荐信。</h2>
          </div>
          <button class="icon-button" aria-label="关闭提名窗口" @click="nominationDialog?.close()">
            <AppIcon name="close" />
          </button>
        </div>
        <label class="nomination-source">作品来源<select v-model="sourceMode" :disabled="submitting || uploadingCover" @change="changeSource">
          <option value="catalog">从书库选择</option><option value="bangumi">搜索 Bangumi</option><option value="manual">手动填写</option>
        </select></label>
        <p v-if="catalogError" class="form-error" role="alert">书库暂未加载成功。<button type="button" class="text-link" @click="refreshWorks()">重新加载书库</button></p>
        <label v-if="sourceMode === 'catalog'" class="nomination-source">书库作品<select v-model="selectedWorkId" :disabled="submitting" @change="chooseWork">
          <option :value="null">请选择作品</option><option v-for="work in works" :key="work.rank" :value="work.rank">{{ work.title }}{{ work.studio ? ' · ' + work.studio : '' }}</option>
        </select></label>
        <BangumiSearch v-if="sourceMode === 'bangumi'" :works="works" selectable :selecting="submitting" selection-label="选择此作品提名" @selected="chooseBangumi" />
        <p class="nomination-help">已有作品复用书库资料；新作品将在提交提名时一并收录并记录添加人，提名仍需审核。</p>
        <p v-if="selectedWork || selectedSubject" class="nomination-selection" role="status">已选择：{{ formTitle }}{{ selectedWork ? ' · 已在书库' : ' · 来自 Bangumi' }}</p>
        <form class="award-form" @submit.prevent="submitNomination">
          <label
            >作品名称<input
              v-model="formTitle"
              list="award-known-works"
              maxlength="160"
              :readonly="sourceMode !== 'manual'"
              :disabled="submitting || uploadingCover"
              required
              placeholder="输入作品名称，也可以提名书架之外的作品" /></label
          ><datalist id="award-known-works">
            <option v-for="work in works" :key="work.rank" :value="work.title" /></datalist
          ><label
            >制作组 <span>选填</span
            ><input v-model="formStudio" maxlength="200" :readonly="sourceMode !== 'manual'" :disabled="submitting" placeholder="例如：Key、TYPE-MOON" /></label
          ><label
            >提名说明 <span>选填，最多 600 字，不计推荐词分数</span
            ><textarea
              v-model="formReason"
              rows="5"
              maxlength="600"
              :disabled="submitting"
              placeholder="哪一个瞬间，让你想把它推荐给大家？"
            ></textarea>
          </label>
          <section v-if="sourceMode === 'manual'" class="nomination-cover-field" aria-label="作品封面">
            <p v-if="manualExistingWork" class="nomination-help">该作品已在书库中，将使用现有封面。</p>
            <template v-else>
              <p class="nomination-cover-label">作品封面 <span>选填</span></p>
              <input ref="nominationCoverInput" type="file" hidden aria-label="上传提名作品封面" accept="image/jpeg,image/png,image/webp" :disabled="submitting || uploadingCover" @change="uploadNominationCover" />
              <button type="button" class="button secondary" :disabled="submitting || uploadingCover" @click="nominationCoverInput?.click()"><AppIcon name="image" :size="18" />{{ uploadingCover ? '正在上传…' : nominationCover ? '更换封面图片' : '选择封面图片' }}</button>
              <p v-if="nominationCover" class="nomination-cover-filename">已选择：{{ nominationCover.name }}</p>
              <p class="nomination-help" role="status">{{ uploadingCover ? '正在上传封面…' : '支持 JPG、PNG、WebP，最大 5 MB；封面将随新作品一起收录到书库。' }}</p>
              <SafeImage v-if="nominationCover" class="nomination-cover-preview" :src="nominationCover.url" alt="提名作品封面预览" />
              <button v-if="nominationCover" type="button" class="button secondary" :disabled="submitting || uploadingCover" @click="nominationCover = null">移除封面</button>
            </template>
          </section>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <div class="award-form-bottom">
            <span>已提名 {{ nominationCount }} / {{ campaign.nominationLimit }} 部 · 提交后进入审核</span
            ><button class="button primary" type="submit" :disabled="submitting || uploadingCover">{{ submitting ? '正在提交…' : uploadingCover ? '正在上传封面…' : '提交提名' }}<AppIcon name="send" :size="16" /></button>
          </div>
        </form>
      </dialog>
    </template>
  </div>
</template>
