<script setup lang="ts">
import type { AwardCampaign, AwardNomination, CampaignPhase } from '~/types/awards'
import {
  DEFAULT_BALLOT_RULES,
  normalizeCampaignConfirmation,
  phaseNames,
  roleNames,
  formatAwardTime,
  formatNominationTime,
  nominationDisplayName,
  nominationDisplayTime,
  nominationDisplayReason,
  toAwardTimeInput,
  fromAwardTimeInput,
  awardVotingMode,
  findAwardTieGroups,
} from '~/utils/awards'
const awards = useAwards()
const identity = usePreviewIdentity()
const { campaign, campaigns, selectedCampaignId, campaignNominations, candidates, audit } = awards
const { loginOpen, notify } = useForum()
const busy = ref(false),
  deleteOpen = ref(false),
  deleteTitle = ref('')
const deleteError = ref('')
const deleteMatches = computed(
  () =>
    !!deleteTitle.value.trim() &&
    normalizeCampaignConfirmation(deleteTitle.value) ===
      normalizeCampaignConfirmation(campaign.value.title),
)
async function removeActivity() {
  if (busy.value || !deleteMatches.value) return
  busy.value = true
  deleteError.value = ''
  try {
    await awards.deleteCampaign(deleteTitle.value)
    notify('活动已删除。')
  } catch (e) {
    const message = (e as Error).message
    deleteError.value = /Cannot DELETE/i.test(message)
      ? '服务器尚未更新活动删除接口，请更新并重启后端后重试。'
      : message
  } finally {
    busy.value = false
  }
}
const weightedRule = computed(() => campaign.value.votingRule === 'weighted-v1')
const tab = ref('settings')
const reviewFilter = ref('pending')
const reviewNotes = reactive<Record<string, string>>({})
const error = ref('')
const createDialog = ref<HTMLDialogElement | null>(null)
const createEdition = ref('')
const createError = ref('')
const nextEdition = computed(() => Math.max(0, ...campaigns.value.map((c) => c.edition)) + 1)
function openCreate() {
  createError.value = ''
  createEdition.value = String(nextEdition.value)
  createDialog.value?.showModal()
}
function closeCreate() {
  createDialog.value?.close()
}
async function createActivity() {
  if (busy.value) return
  const edition = Number(createEdition.value)
  if (!Number.isInteger(edition) || edition < 1 || edition > 99) {
    createError.value = '届数需为 1–99 之间的整数。'
    return
  }
  if (campaigns.value.some((c) => c.edition === edition)) {
    createError.value = `第 ${edition} 届已存在，请换一个届数。`
    return
  }
  busy.value = true
  createError.value = ''
  try {
    await awards.createCampaign(edition)
    tab.value = 'settings'
    closeCreate()
    notify(`已创建第 ${edition} 届活动草稿。`)
  } catch (e) {
    createError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
const confirmPhase = ref<CampaignPhase | null>(null)
const confirmRunoff = ref(false)
const confirmTieBreak = ref(false)
const tieBreak = computed(() => awardVotingMode(campaign.value) === 'tie-break')
const unresolvedTies = computed(() => findAwardTieGroups(awards.results.value))
const scoredCount = computed(() => awards.results.value.filter((item) => item.votes > 0).length)
const needsRunoff = computed(() => campaign.value.phase === 'voting' && (campaign.value.votingRound || 1) === 1 && scoredCount.value < campaign.value.winnerCount)
const workTitle = (id: string) => candidates.value.find((item) => item.id === id)?.title || id
const canStartTieBreak = computed(() => ['voting', 'results', 'archived'].includes(campaign.value.phase) && unresolvedTies.value.length > 0 && !needsRunoff.value)
async function openTieBreak() {
  await run(() => awards.startTieBreak(), '同票加赛已开启，并已发送站内通知。')
  confirmTieBreak.value = false
}
async function openRunoff() {
  await run(() => awards.startRunoff(), '二次投票已开启，首轮已得分作品保留。')
  confirmRunoff.value = false
  confirmTieBreak.value = false
}
const settings = ref<AwardCampaign>({ ...campaign.value })
const times = reactive({ nominationStart: '', nominationEnd: '', votingStart: '', votingEnd: '' })
const nextPhase = computed(
  () =>
    (
      ({
        draft: 'nomination',
        nomination: 'voting',
        voting: 'results',
        results: 'archived',
        archived: undefined,
      }) as const
    )[campaign.value.phase],
)
const transitionLabels = {
  nomination: '开放提名',
  voting: '结束提名并开放投票',
  results: '结束投票并公布结果',
  archived: '归档本届活动',
  draft: '筹备',
}
watch(
  () => settings.value.ballotRules,
  () => {
    if (settings.value.votingRule === 'weighted-v1' && settings.value.ballotRules)
      settings.value.voteLimit = settings.value.ballotRules.loveLimit + settings.value.ballotRules.likeLimit
  },
  { deep: true },
)
const rulesLocked = computed(() => campaign.value.phase !== 'draft')
const settingsLocked = computed(() => ['results', 'archived'].includes(campaign.value.phase))
const pendingCount = computed(
  () => campaignNominations.value.filter((item) => item.status === 'pending').length,
)
const reviewItems = computed(() =>
  campaignNominations.value
    .filter((item) => reviewFilter.value === 'all' || item.status === 'pending')
    .slice()
    .reverse(),
)
const dirty = computed(
  () =>
    JSON.stringify(settings.value) !==
      JSON.stringify({
        ...campaign.value,
        ballotRules: { ...(campaign.value.ballotRules || DEFAULT_BALLOT_RULES) },
      }) ||
    (Object.keys(times) as (keyof typeof times)[]).some(
      (key) => times[key] !== toAwardTimeInput(campaign.value[key]),
    ),
)
const recentAudit = computed(() =>
  audit.value
    .filter((item) => item.campaignId === campaign.value.id)
    .slice(0, 8)
    .reverse(),
)
const statusNames = { pending: '待审核', approved: '已通过', rejected: '已退回', withdrawn: '已撤回' }
const detailsDialog = ref<HTMLDialogElement | null>(null)
const editingTitle = ref('')
const detailsCampaignId = ref('')
const detailEntries = ref<{ original: AwardNomination; name: string; date: string; reason: string }[]>([])
const detailsError = ref(''), detailsBusy = ref(false)
function sameWorkCount(item: AwardNomination) {
  return campaignNominations.value.filter((n) => n.candidateId === item.candidateId).length
}
async function openNominationDetails(item: AwardNomination) {
  if (busy.value || detailsBusy.value) return
  editingTitle.value = item.title
  detailsCampaignId.value = campaign.value.id
  detailEntries.value = campaignNominations.value
    .filter((n) => n.candidateId === item.candidateId)
    .map((n) => ({ original: { ...n }, name: nominationDisplayName(n), date: toAwardTimeInput(nominationDisplayTime(n)), reason: nominationDisplayReason(n) }))
  detailsError.value = ''
  await nextTick()
  detailsDialog.value?.showModal()
}
function closeNominationDetails() {
  if (detailsBusy.value) return
  detailsDialog.value?.close()
  detailEntries.value = []
}
async function saveNominationDetails() {
  if (!detailEntries.value.length || detailsBusy.value) return
  detailsBusy.value = true
  detailsError.value = ''
  try {
    if (detailsCampaignId.value !== campaign.value.id) throw new Error('当前届次已切换，请重新打开编辑窗口。')
    const entries = detailEntries.value.filter((entry) =>
      entry.name.trim() !== nominationDisplayName(entry.original) ||
      entry.date !== toAwardTimeInput(nominationDisplayTime(entry.original)) ||
      entry.reason.trim() !== nominationDisplayReason(entry.original),
    ).map((entry) => {
      if (!entry.original.detailsRevision) throw new Error('提名版本信息缺失，请刷新记录后重试。')
      const nominatedAt = entry.date === toAwardTimeInput(nominationDisplayTime(entry.original))
        ? nominationDisplayTime(entry.original)
        : fromAwardTimeInput(entry.date)
      if (!nominatedAt) throw new Error('请填写实际提名时间。')
      return { id: entry.original.id, nominatorName: entry.name.trim(), nominatedAt, reason: entry.reason.trim(), revision: entry.original.detailsRevision }
    })
    if (!entries.length) { detailsError.value = '尚未修改提名信息。'; return }
    await awards.editNominationDetails(entries)
    detailsDialog.value?.close()
    detailEntries.value = []
    notify(`已保存 ${entries.length} 条提名信息。`)
  } catch (e) {
    detailsError.value = (e as Error).message
  } finally {
    detailsBusy.value = false
  }
}

function loadSettings() {
  // Refreshes may replace the campaign object; only changing editions closes an edit in progress.
  if (detailsCampaignId.value !== campaign.value.id) {
    detailsDialog.value?.close()
    detailEntries.value = []
  }
  settings.value = {
    ...campaign.value,
    ballotRules: { ...(campaign.value.ballotRules || DEFAULT_BALLOT_RULES) },
  }
  for (const key of Object.keys(times) as (keyof typeof times)[])
    times[key] = toAwardTimeInput(campaign.value[key])
  error.value = ''
  confirmPhase.value = null
  confirmRunoff.value = false
  deleteOpen.value = false
  deleteTitle.value = ''
  deleteError.value = ''
}
onMounted(() => {
  awards.initialize()
  loadSettings()
})
watch(campaign, loadSettings, { deep: true })
useSeoMeta({ title: '十二橙器活动管理 · 澄之响' })

async function run(action: () => unknown, message: string) {
  if (busy.value) return
  busy.value = true
  try {
    await action()
    error.value = ''
    notify(message)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败，请重试。'
  } finally {
    busy.value = false
  }
}
function saveSettings() {
  run(
    () =>
      awards.saveSettings({
        ...settings.value,
        voteLimit:
          settings.value.votingRule === 'weighted-v1'
            ? settings.value.ballotRules!.loveLimit + settings.value.ballotRules!.likeLimit
            : settings.value.voteLimit,
        nominationStart: fromAwardTimeInput(times.nominationStart),
        nominationEnd: fromAwardTimeInput(times.nominationEnd),
        votingStart: fromAwardTimeInput(times.votingStart),
        votingEnd: fromAwardTimeInput(times.votingEnd),
      }),
    '活动设置已保存。',
  )
}
function advance() {
  if (!confirmPhase.value) return
  const target = confirmPhase.value
  run(() => awards.movePhase(target), `活动阶段已更新为「${phaseNames[target]}」。`)
  confirmPhase.value = null
}
function review(id: string, status: 'approved' | 'rejected') {
  run(
    () => awards.reviewNomination(id, status, reviewNotes[id] || ''),
    status === 'approved' ? '提名已通过审核。' : '已退回提名并附上反馈。',
  )
}
</script>

<template>
  <div v-if="!identity.can('campaign.manage')" class="award-access-denied">
    <AppIcon name="users" :size="34" />
    <p class="eyebrow">ACTIVITY MANAGEMENT</p>
    <h1>这里需要管理员身份。</h1>
    <p>普通成员可以参与提名与投票。<br />管理员负责活动配置、审核、创建届次与归档。</p>
    <button class="button primary" @click="loginOpen = true">
      登录账号<AppIcon name="login" :size="17" /></button
    ><NuxtLink to="/awards" class="text-link">回到活动前台<AppIcon name="arrowRight" :size="15" /></NuxtLink
    ><small>请使用已被授权的管理员账号登录。</small>
  </div>
  <div v-else class="award-admin-page">
    <div class="award-page-top">
      <p class="page-kicker"><AppIcon name="filter" :size="15" /> COMMUNITY AWARDS / MANAGEMENT</p>
      <NuxtLink to="/awards" class="text-link"
        >查看活动前台<AppIcon name="arrowUpRight" :size="15"
      /></NuxtLink>
    </div>
    <header class="award-admin-heading">
      <div>
        <p class="eyebrow">让每一份喜欢，有序地被看见。</p>
        <h1>十二橙器活动管理<span>。</span></h1>
        <p>
          {{ identity.account.value.name
          }}<span class="award-admin-role">{{ roleNames[identity.role.value] }}</span>
        </p>
      </div>
      <button
        v-if="identity.can('campaign.create')"
        class="button primary"
        :disabled="busy"
        @click="openCreate"
      >
        <AppIcon name="plus" :size="16" />新建一届
      </button>
    </header>
    <div class="award-prototype-notice">
      <AppIcon name="info" :size="15" /><span>活动配置与提名审核由服务器校验并记录。</span>
    </div>
    <p v-if="!campaigns.length" class="empty-state">暂时没有活动，可以点击「新建一届」创建。</p>
    <p v-if="error && !campaigns.length" role="alert" class="form-error">{{ error }}</p>
    <template v-if="campaigns.length"
      ><div class="award-admin-campaign-bar">
        <label
          ><span>当前活动</span
          ><select v-model="selectedCampaignId" @change="awards.persist">
            <option v-for="item in campaigns" :key="item.id" :value="item.id">
              第 {{ item.edition }} 届 · {{ item.title }}
            </option>
          </select></label
        ><span class="award-status approved">{{ phaseNames[campaign.phase] }}</span
        ><NuxtLink to="/ranking">第一届结果档案<AppIcon name="external" :size="13" /></NuxtLink>
      </div>
      <div class="award-admin-summary">
        <div>
          <span>当前阶段</span><strong>{{ phaseNames[campaign.phase] }}</strong>
        </div>
        <div>
          <span>待审核提名</span><strong>{{ pendingCount }}<small>条</small></strong>
        </div>
        <div>
          <span>正式候选</span><strong>{{ candidates.length }}<small>部</small></strong>
        </div>
        <div>
          <span>已提交选票</span><strong>{{ awards.ballotCount.value }}<small>份</small></strong>
        </div>
      </div>
      <nav class="award-admin-tabs" aria-label="活动管理功能">
        <button
          :class="{ active: tab === 'settings' }"
          @click="
            tab = 'settings'; error = ''
          "
        >
          <AppIcon name="calendar" :size="16" />活动设置</button
        ><button
          :class="{ active: tab === 'review' }"
          @click="
            tab = 'review'; error = ''
          "
        >
          <AppIcon name="check" :size="16" />提名审核<span v-if="pendingCount">{{ pendingCount }}</span>
        </button>
        <button :class="{ active: tab === 'votes' }" @click="tab = 'votes'; error = ''; awards.initialize()"><AppIcon name="trophy" :size="16" />投票数据</button>
      </nav>
      <p v-if="error" class="award-admin-error" role="alert"><AppIcon name="info" :size="16" />{{ error }}</p>
      <div v-if="tab === 'settings'" class="award-admin-settings-grid">
        <form class="award-admin-card award-form" @submit.prevent="saveSettings">
          <div class="award-admin-card-heading">
            <div>
              <h2>按阶段设置活动</h2>
              <p>初始名额为建议值，可在开放活动前调整。</p>
            </div>
            <AppIcon name="calendar" :size="21" />
          </div>
          <label>活动名称<input v-model="settings.title" maxlength="80" required :disabled="busy" /></label>
          <section class="award-settings-stage" aria-labelledby="nomination-settings-heading">
            <h3 id="nomination-settings-heading">1 · 提名设置</h3>
            <p>先公开征集并署名展示，再由管理员审核。相同作品合并展示，多位用户可共同提名；同一用户不能重复提名同一作品。</p>
            <label>每人最多提名<span class="award-number-input"><input v-model.number="settings.nominationLimit" aria-label="每人最多提名" type="number" min="1" max="100" required :disabled="rulesLocked || busy" /><span>部</span></span></label>
            <div class="award-time-group"><h3>提名时间 <span>UTC+8</span></h3><div>
              <label>提名开始时间<input v-model="times.nominationStart" type="datetime-local" :disabled="settingsLocked || busy" /></label>
              <label>提名结束时间<input v-model="times.nominationEnd" type="datetime-local" :disabled="settingsLocked || busy" /></label>
            </div></div>
          </section>
          <section class="award-settings-stage" aria-labelledby="voting-settings-heading">
            <h3 id="voting-settings-heading">2 · 投票设置</h3>
            <p>投票名单来自本届审核通过的全部提名作品；前台显示分数和署名推荐词，选票详情仅管理员可见。</p>
            <label>投票计分规则<select v-model="settings.votingRule" :disabled="rulesLocked || busy" @change="settings.votingRule === 'weighted-v1' && (settings.voteLimit = 3)"><option value="weighted-v1">自定义加权投票：真爱票、喜爱票与推荐词</option><option value="legacy">原规则：每部作品一票</option></select></label>
          <fieldset
            v-if="settings.votingRule === 'weighted-v1' && settings.ballotRules"
            :disabled="rulesLocked || busy"
            class="plain-fieldset"
          >
            <legend>自定义投票规则</legend>
            <div class="award-quota-fields">
              <label
                v-for="[key, label, max] in [
                  ['loveLimit', '真爱票张数', 10],
                  ['likeLimit', '喜爱票张数', 10],
                  ['lovePoints', '真爱票分值', 100],
                  ['likePoints', '喜爱票分值', 100],
                  ['recommendationPoints', '每份推荐词加分', 100],
                  ['recommendationLimit', '每人推荐词份数上限', 20],
                ] as const"
                :key="key"
                >{{ label
                }}<input v-model.number="settings.ballotRules[key]" type="number" min="0" :max="max" required
              /></label>
            </div>
            <p>
              推荐词始终选填，每个已投作品最多一份；设份数上限为 0 可关闭推荐词。筹备中可修改，开放后锁定。
            </p>
          </fieldset>
            <div class="award-quota-fields">
              <label>每人最多投票<span class="award-number-input"><input v-model.number="settings.voteLimit" aria-label="每人最多投票" type="number" min="1" max="100" required :disabled="rulesLocked || busy || settings.votingRule === 'weighted-v1'" /><span>票</span></span></label>
              <label>计划入选作品<span class="award-number-input"><input v-model.number="settings.winnerCount" aria-label="计划入选作品" type="number" min="1" max="100" required :disabled="rulesLocked || busy" /><span>部</span></span></label>
            </div>
            <div class="award-time-group"><h3>{{ tieBreak ? '同票加赛时间' : campaign.votingRound === 2 ? '二次投票时间' : '首轮投票时间' }} <span>UTC+8</span></h3><div>
              <label>投票开始时间<input v-model="times.votingStart" type="datetime-local" :disabled="settingsLocked || busy" /></label>
              <label>投票结束时间<input v-model="times.votingEnd" type="datetime-local" :disabled="settingsLocked || busy" /></label>
            </div></div>
            <p class="award-field-help">首轮有效得分作品不足计划名额时，需进行二次投票：保留首轮已得分作品，只对其余提名作品补投。</p>
          </section>
          <p class="award-field-help">开放提名后，名额与计分规则锁定。时间需同时填写开始与结束，或同时留空；阶段由管理员按顺序推进。</p>
          <div class="award-settings-save">
            <span>{{
              settingsLocked
                ? '已公布结果：仅可修改活动名称'
                : dirty
                  ? '有尚未保存的修改'
                  : '设置已保存到服务器'
            }}</span
            ><button type="submit" class="button primary" :disabled="busy || !dirty">
              <AppIcon name="check" :size="16" />保存活动设置
            </button>
          </div>
        </form>
        <div class="award-admin-side">
          <section class="award-admin-card award-stage-management">
            <div class="award-admin-card-heading">
              <div>
                <h2>阶段推进</h2>
                <p>阶段按顺序开放，每次推进都会向所有有效账号发送站内通知，往届结果保留。</p>
              </div>
            </div>
            <ol>
              <li
                v-for="phase in ['draft', 'nomination', 'voting', 'results', 'archived'] as CampaignPhase[]"
                :key="phase"
                :class="{ active: campaign.phase === phase }"
              >
                <span></span>{{ phaseNames[phase]
                }}<AppIcon v-if="campaign.phase === phase" name="arrowLeft" :size="14" />
              </li>
            </ol>
            <p v-if="pendingCount && campaign.phase === 'nomination'" class="award-field-help">
              还有 {{ pendingCount }} 条提名待审核，处理完成后才能开放投票。
            </p>
            <div v-if="campaign.phase === 'voting'" class="award-runoff-management">
              <p>第 {{ campaign.votingRound || 1 }} 轮{{ tieBreak ? ' · 同票加赛' : '' }} · 有效得分 {{ scoredCount }} / {{ campaign.winnerCount }} 部</p>
              <p v-if="needsRunoff">未满计划名额，需先进行二次投票。首轮已得分作品保留。</p>
              <button v-if="needsRunoff && !confirmRunoff" type="button" class="button secondary full" :disabled="busy || dirty" @click="confirmRunoff = true">开启二次投票</button>
              <div v-if="confirmRunoff" class="award-phase-confirm"><strong>确认开启二次投票？</strong><p>保存首轮全部记录，保留已得分作品，其余已提名作品开放补投。所有人获得一份新的本轮选票，补投时间将清空，可重新设置。</p><div class="award-phase-actions"><button type="button" class="button secondary" :disabled="busy" @click="confirmRunoff = false">取消</button><button type="button" class="button primary" :disabled="busy" @click="openRunoff">确认开启二次投票</button></div></div>
              <p v-if="!tieBreak && campaign.votingRound === 2 && !awards.votingCandidates.value.length">没有剩余可补投作品。提名作品数不足时，可公布实际有效结果。</p>
              <button type="button" class="text-link" @click="awards.initialize">刷新投票数据</button>
            </div>
            <div v-if="canStartTieBreak" class="award-tie-break-management">
              <strong>还有 {{ unresolvedTies.length }} 组同票，暂不能公布或归档。</strong>
              <p v-for="group in unresolvedTies" :key="group.rank">第 {{ group.rank }}–{{ group.rank + group.candidateIds.length - 1 }} 名：{{ group.candidateIds.map(workTitle).join('、') }}</p>
              <p>每组每人一票，仅决定组内名次；仍同票就继续加赛。已公布或归档的本届将重新开放投票，历史记录保留。</p>
              <button v-if="!confirmTieBreak" type="button" class="button secondary full" :disabled="busy || dirty" @click="confirmTieBreak = true">开启同票加赛</button>
              <div v-else class="award-phase-confirm">
                <strong>确认开启下一轮同票加赛？</strong><p>保留本轮选票和得分，仅对以上仍同票的作品重新投票，并向所有有效账号发送通知。加赛时间清空，可重新设置。</p>
                <div><button type="button" class="button secondary" :disabled="busy" @click="confirmTieBreak = false">取消</button><button type="button" class="button primary" :disabled="busy" @click="openTieBreak">确认开启同票加赛</button></div>
              </div>
            </div>
            <template
              v-if="
                nextPhase && identity.can(nextPhase === 'archived' ? 'campaign.archive' : 'campaign.manage')
              "
              ><button class="button secondary full" :disabled="dirty || busy || ((nextPhase === 'results' || nextPhase === 'archived') && (needsRunoff || unresolvedTies.length > 0))" @click="confirmPhase = nextPhase">
                {{ transitionLabels[nextPhase] }}<AppIcon name="arrowRight" :size="15" />
              </button>
              <p v-if="dirty" class="award-field-help">请先保存当前设置。</p></template
            >
            <p v-else-if="campaign.phase === 'results'" class="award-field-help">
              活动结果已公布，可归档保留。
            </p>
            <p v-else class="award-field-help">本届已归档，结果只读。</p>
            <div v-if="confirmPhase" class="award-phase-confirm">
              <strong>{{ transitionLabels[confirmPhase] }}？</strong>
              <p>
                {{
                  confirmPhase === 'voting'
                    ? '提名将停止收集，仅审核通过的作品进入投票。'
                    : confirmPhase === 'results'
                      ? '所有选票将锁定，结果按实际得票公布。'
                      : confirmPhase === 'archived'
                        ? '归档后本届设置与结果将保持只读。'
                        : '成员将可以按已保存的规则提交作品提名。'
                }}<br />确认推进后，将向所有有效账号发送本阶段的站内通知。
              </p>
              <div>
                <button type="button" class="button secondary" :disabled="busy" @click="confirmPhase = null">取消</button><button type="button" class="button primary" :disabled="busy" @click="advance">确认推进</button>
              </div>
            </div>
          </section>
          <section class="award-admin-card award-admin-audit">
            <h2>最近管理与参与记录</h2>
            <p v-if="!recentAudit.length" class="award-field-help">
              配置、审核、阶段与权限操作会记录在这里。
            </p>
            <ol v-else>
              <li v-for="item in recentAudit" :key="item.id">
                <strong>{{ item.action }}</strong
                ><span>{{ item.actor }} · {{ formatAwardTime(item.createdAt) }}</span>
              </li>
            </ol>
          </section>
        </div>
      </div>
      <section v-else-if="tab === 'review'" class="award-admin-card">
        <div class="award-admin-card-heading">
          <div>
            <h2>每一份推荐，都认真读一读。</h2>
            <p>同一作品的多位提名人会合并为一个候选作品。</p>
          </div>
          <select v-model="reviewFilter" aria-label="审核记录筛选">
            <option value="pending">只看待审核</option>
            <option value="all">全部记录</option>
          </select>
        </div>
        <p class="nomination-edit-help">各届均可按作品编辑多条提名，分别修改提名人、实际时间和提名词，一次保存。原始提交记录、审核状态和票数保留；已审核的记录请选择“全部记录”查看。</p>
        <div v-if="!reviewItems.length" class="empty-state">
          <AppIcon name="check" :size="30" />
          <h3>暂时没有待处理的提名</h3>
          <p>成员提交后，会在这里进入审核队列。</p>
        </div>
        <div class="award-review-list">
          <article v-for="item in reviewItems" :key="item.id">
            <div class="award-my-nomination-top">
              <div>
                <h3>{{ item.title }}</h3>
                <span
                  >{{ nominationDisplayName(item) }} · {{ item.studio || '制作组未填写' }} ·
                  {{ formatNominationTime(item) }}{{ item.displayOverride ? ' · 展示信息已编辑' : item.qqSync ? ' · QQ群已同步' : '' }}</span
                >
              </div>
              <span :class="['award-status', item.status]">{{ statusNames[item.status] }}</span>
            </div>
            <blockquote>{{ nominationDisplayReason(item) || '未填写提名词' }}</blockquote>
            <div class="nomination-record-actions"><button type="button" class="button secondary" :disabled="busy || detailsBusy" @click="openNominationDetails(item)">编辑本作提名（{{ sameWorkCount(item) }} 条）</button><span v-if="item.displayOverride || item.qqSync">原网站提交：{{ item.accountName }} · {{ formatAwardTime(item.createdAt) }}</span></div>
            <template v-if="item.status === 'pending' && campaign.phase === 'nomination'"
              ><label :for="`review-note-${item.id}`">审核备注 <span>退回时必填</span></label
              ><textarea
                :id="`review-note-${item.id}`"
                v-model="reviewNotes[item.id]"
                rows="2"
                maxlength="300"
                placeholder="说明需要补充或修改的内容"
              ></textarea>
              <div class="award-review-actions">
                <button class="button secondary" @click="review(item.id, 'rejected')">退回修改</button
                ><button class="button primary" @click="review(item.id, 'approved')">
                  <AppIcon name="check" :size="15" />通过提名
                </button>
              </div></template
            >
            <p v-else-if="item.reviewNote" class="award-review-note">审核反馈：{{ item.reviewNote }}</p>
          </article>
        </div>
      </section>
      <section v-else-if="tab === 'votes'" class="award-admin-card award-data-panel">
        <div class="award-admin-card-heading"><div><h2>投票与计分数据</h2><p>管理员可查看全部轮次选票、署名推荐词与操作记录；前台仅公开分数和推荐词作者。</p></div><button class="button secondary" @click="awards.initialize">刷新数据</button></div>
        <p v-if="campaign.phase === 'draft' || campaign.phase === 'nomination'">请先完成提名审核，再开放投票。候选名单来自本届审核通过的全部提名作品。</p>
        <div class="award-data-table"><table><thead><tr><th>作品</th><th>分数</th><th>状态</th></tr></thead><tbody><tr v-for="result in awards.results.value" :key="result.id"><td>{{ result.title }}</td><td>{{ result.votes }}</td><td>{{ campaign.lockedCandidateIds?.includes(result.id) ? '首轮保留' : result.votes > 0 ? '有效得分' : '尚未得分' }}</td></tr></tbody></table></div>
        <h3>全部选票 · {{ awards.ballots.value.length }} 条</h3>
        <p v-if="!awards.ballots.value.length">暂无选票记录。</p>
        <details v-for="ballot in awards.ballots.value" :key="ballot.round + ':' + ballot.id" class="award-ballot-record"><summary>{{ ballot.accountName }} · 第 {{ ballot.round }} 轮{{ ballot.mode === 'tie-break' ? '同票加赛' : '' }} · {{ ballot.candidateIds.length ? ballot.candidateIds.length + ' 部作品' : '已撤回' }} · {{ formatAwardTime(ballot.updatedAt) }}</summary><p>账号编号：{{ ballot.accountId }}</p><p v-if="weightedRule && ballot.mode !== 'tie-break'">真爱票：{{ (ballot.loveIds || (ballot.loveId ? [ballot.loveId] : [])).map(workTitle).join('、') || '无' }}</p><p v-if="weightedRule && ballot.mode !== 'tie-break'">喜爱票：{{ (ballot.likeIds || []).map(workTitle).join('、') || '无' }}</p><p v-else>投票作品：{{ ballot.candidateIds.map(workTitle).join('、') || '无' }}</p><p v-for="rec in ballot.recommendations || []" :key="rec.candidateId">《{{ workTitle(rec.candidateId) }}》推荐词：{{ rec.text }}</p></details>
        <details class="award-ballot-record"><summary>全部管理与参与记录 · {{ audit.length }} 条</summary><ol><li v-for="entry in audit" :key="entry.id">{{ entry.actor }} · {{ entry.action }} · {{ formatAwardTime(entry.createdAt) }}</li></ol></details>
      </section>
      <dialog ref="detailsDialog" class="modal nomination-details-dialog" aria-labelledby="nomination-details-title" @cancel.prevent="closeNominationDetails">
        <template v-if="detailEntries.length">
          <header class="nomination-details-heading"><div><p class="eyebrow">第 {{ campaign.edition }} 届 · {{ detailEntries.length }} 条提名</p><h2 id="nomination-details-title">编辑提名人和提名词</h2><h3>{{ editingTitle }}</h3></div><button type="button" class="icon-button" aria-label="关闭提名编辑窗口" :disabled="detailsBusy" @click="closeNominationDetails"><AppIcon name="close" /></button></header>
          <p class="nomination-edit-help">同一作品的每条提名可分别编辑。时间按北京时间 UTC+8 填写；提名词选填，最多 600 字，不参与投票推荐词加分。</p>
          <form class="award-form" @submit.prevent="saveNominationDetails">
            <fieldset v-for="(entry, index) in detailEntries" :key="entry.original.id" class="nomination-detail-entry" :disabled="detailsBusy">
              <legend>提名 {{ index + 1 }} · {{ statusNames[entry.original.status] }}</legend>
              <div class="nomination-details-fields"><label>提名人<input v-model="entry.name" required maxlength="64" placeholder="填写实际提名人的昵称" /></label><label>实际提名时间（北京时间）<input v-model="entry.date" type="datetime-local" required /></label></div>
              <label>提名词<textarea v-model="entry.reason" rows="3" maxlength="600" placeholder="写下这位提名人想推荐它的理由，可留空"></textarea></label>
              <div class="nomination-original"><span>{{ entry.reason.length }} / 600</span><details><summary>查看原始提交</summary><p>{{ entry.original.accountName }} · {{ formatAwardTime(entry.original.createdAt) }}</p><p>{{ entry.original.reason || '未填写提名词' }}</p></details></div>
            </fieldset>
            <p v-if="detailsError" class="form-error" role="alert">{{ detailsError }}</p>
            <footer class="nomination-details-buttons"><button type="button" class="button secondary" :disabled="detailsBusy" @click="closeNominationDetails">取消</button><button type="submit" class="button primary" :disabled="detailsBusy">{{ detailsBusy ? '正在保存…' : '保存全部修改' }}</button></footer>
          </form>
        </template>
      </dialog>
      <section class="award-admin-card campaign-delete-zone">
        <header>
          <AppIcon name="info" :size="22" />
          <div>
            <h2>删除活动</h2>
            <p>删除后将停止展示和投票，已有参与记录保留用于审计。</p>
          </div>
        </header>
        <button
          v-if="!deleteOpen"
          type="button"
          class="button secondary"
          :disabled="busy"
          @click="deleteOpen = true"
        >
          删除本届活动
        </button>
        <form v-else @submit.prevent="removeActivity">
          <p class="delete-campaign-name">
            即将删除：<strong>{{ campaign.title }}</strong>
          </p>
          <label for="delete-campaign-title">输入活动名称确认删除</label>
          <input
            id="delete-campaign-title"
            v-model="deleteTitle"
            :placeholder="campaign.title"
            maxlength="160"
            autocomplete="off"
            :disabled="busy"
            aria-describedby="delete-campaign-help"
          />
          <p id="delete-campaign-help" :class="{ 'name-matched': deleteMatches }" role="status">
            {{
              deleteMatches
                ? '名称已匹配，可以确认删除。'
                : deleteTitle
                  ? '名称尚未匹配，请核对上方活动名称；空格不影响匹配。'
                  : '请填写完整活动名称，空格与全角字符会自动兼容。'
            }}
          </p>
          <p v-if="deleteError" class="form-error" role="alert">{{ deleteError }}</p>
          <div class="delete-campaign-actions">
            <button type="button" class="button secondary" :disabled="busy" @click="deleteOpen = false">
              取消删除</button
            ><button type="submit" class="button danger" :disabled="busy || !deleteMatches">
              {{ busy ? '正在删除…' : '确认删除活动' }}
            </button>
          </div>
        </form>
      </section>
    </template>
  </div>
  <dialog
    ref="createDialog"
    class="modal create-campaign-dialog"
    aria-labelledby="create-campaign-title"
    @cancel.prevent="closeCreate"
  >
    <div class="create-campaign-heading">
      <div>
        <p class="eyebrow">NEW CAMPAIGN</p>
        <h2 id="create-campaign-title">新建一届活动</h2>
      </div>
      <button type="button" class="icon-button" aria-label="关闭" @click="closeCreate"><AppIcon name="close" :size="16" /></button>
    </div>
    <form class="award-form" @submit.prevent="createActivity">
      <label
        >活动届数<span class="create-edition-field"
          ><span>第</span
          ><input
            v-model="createEdition"
            type="number"
            min="1"
            max="99"
            step="1"
            inputmode="numeric"
            required
            aria-describedby="create-edition-help" /><span>届</span></span
        ></label
      >
      <p id="create-edition-help" class="create-edition-help">
        默认填入下一届；可改为尚未使用的届数，不能与现有活动重复；若该届数属于已删除的档案，将回收该届数重新创建。
      </p>
      <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
      <div class="create-campaign-actions">
        <button type="button" class="button secondary" :disabled="busy" @click="closeCreate">取消</button>
        <button type="submit" class="button primary" :disabled="busy">
          {{ busy ? '正在创建…' : '创建草稿' }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.award-tie-break-management { margin-block: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: .75rem; background: var(--orange-soft); }
.award-tie-break-management > strong, .award-tie-break-management > p { font-size: max(14px, .7rem); line-height: 1.9; overflow-wrap: anywhere; }
.award-tie-break-management > p { margin-block: .6rem; color: var(--subtle); }
.nomination-edit-help { margin: 16px 0; padding: 12px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--orange-soft); color: var(--subtle); font-size: max(14px, 0.75rem); line-height: 1.8; overflow-wrap: anywhere; }
.nomination-record-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-block: 12px; }
.nomination-record-actions .button { min-height: 44px; font-size: 14px; }
.nomination-record-actions span, .nomination-original { color: var(--subtle); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.nomination-details-dialog { box-sizing: border-box; width: min(48rem, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: clamp(20px, 3vw, 32px); border-radius: 24px; }
.nomination-details-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.nomination-details-heading h2 { margin: 8px 0; font-size: 24px; line-height: 1.5; }
.nomination-details-heading .icon-button { flex-shrink: 0; }
.nomination-details-heading h3 { font-size: 18px; line-height: 1.6; margin: 0; overflow-wrap: anywhere; }
.nomination-detail-entry { min-width: 0; margin: 16px 0; padding: 16px; border: 1px solid var(--line); border-radius: 16px; }
.nomination-detail-entry legend { padding-inline: 8px; color: var(--text); font-size: 15px; }
.nomination-details-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.nomination-detail-entry label { display: block; min-width: 0; margin-bottom: 12px; }
.nomination-detail-entry input, .nomination-detail-entry textarea { box-sizing: border-box; width: 100%; min-width: 0; font-size: 16px; }
.nomination-original { display: flex; justify-content: space-between; gap: 16px; }
.nomination-original > span { flex-shrink: 0; }
.nomination-original details { text-align: right; }
.nomination-original p { white-space: pre-wrap; }
.nomination-details-buttons { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
.nomination-details-buttons .button { min-height: 44px; font-size: 16px; }
@media (max-width: 599px) {
  .nomination-details-fields { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .nomination-detail-entry { padding: 12px; }
  .nomination-details-buttons { display: grid; grid-template-columns: 1fr; }
  .nomination-details-buttons .button { justify-content: center; }
}
.campaign-delete-zone {
  margin-top: 1.5rem;
  border-color: color-mix(in srgb, #bd493c 30%, var(--line));
}
.campaign-delete-zone > header {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  margin-bottom: 1.1rem;
}
.campaign-delete-zone > header > .app-icon {
  color: #bd493c;
  flex-shrink: 0;
  margin-top: 0.3rem;
}
.campaign-delete-zone h2 {
  font-family: var(--serif);
  font-size: 1.35rem;
  font-weight: 500;
  margin: 0;
}
.campaign-delete-zone p {
  font-size: 0.8rem;
  line-height: 1.8;
  color: var(--subtle);
  margin: 0.5rem 0;
}
.campaign-delete-zone form {
  display: grid;
  gap: 0.65rem;
  max-width: 42rem;
}
.campaign-delete-zone label {
  font-size: 0.8rem;
  display: block;
}
.campaign-delete-zone input {
  width: 100%;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 0.6rem;
  background: var(--bg);
  color: var(--ink);
  padding: 0.8rem;
  min-height: 2.8rem;
  font: inherit;
  font-size: 0.85rem;
}
.delete-campaign-name strong {
  color: var(--ink);
  font-weight: 500;
  overflow-wrap: anywhere;
}
.delete-campaign-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
.campaign-delete-zone .name-matched {
  color: var(--green);
}
.campaign-delete-zone .form-error {
  color: var(--orange);
}
.delete-campaign-actions .danger {
  background: #b84236;
  color: #fff;
  min-height: 2.8rem;
}
.delete-campaign-actions .danger:disabled {
  opacity: 0.5;
}
@media (max-width: 600px) {
  .campaign-delete-zone input {
    font-size: 16px;
  }
  .delete-campaign-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .delete-campaign-actions .button {
    width: 100%;
    justify-content: center;
    padding: 0.7rem 0.5rem;
  }
  .campaign-delete-zone {
    padding: 1.2rem;
  }
}
.create-campaign-dialog {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 32px));
  padding: clamp(20px, 3vw, 28px);
  border-radius: 24px;
}
.create-campaign-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.create-campaign-heading h2 {
  margin: 8px 0 0;
  font-size: 24px;
  line-height: 1.5;
}
.create-campaign-heading .icon-button {
  flex-shrink: 0;
}
.create-edition-field {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  font-size: 14px;
}
.create-edition-field input {
  width: 7rem;
  min-height: 48px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  font-size: 16px;
}
.create-edition-help {
  margin: 12px 0;
  font-size: 13px;
  line-height: 1.8;
  color: var(--subtle);
}
.create-campaign-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
.create-campaign-actions .button {
  min-height: 44px;
  font-size: 14px;
}
</style>
