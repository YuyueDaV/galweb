<script setup lang="ts">
import type { AwardCampaign, CampaignPhase } from '~/types/awards'
import {
  DEFAULT_BALLOT_RULES,
  phaseNames,
  roleNames,
  formatAwardTime,
  toAwardTimeInput,
  fromAwardTimeInput,
} from '~/utils/awards'
const awards = useAwards()
const identity = usePreviewIdentity()
const { campaign, campaigns, selectedCampaignId, campaignNominations, candidates, audit } = awards
const { loginOpen, notify } = useForum()
const busy = ref(false),
  deleteOpen = ref(false),
  deleteTitle = ref('')
const tab = ref('settings')
const reviewFilter = ref('pending')
const reviewNotes = reactive<Record<string, string>>({})
const error = ref('')
const confirmPhase = ref<CampaignPhase | null>(null)
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
    .slice(-8)
    .reverse(),
)
const statusNames = { pending: '待审核', approved: '已通过', rejected: '已退回', withdrawn: '已撤回' }

function loadSettings() {
  settings.value = {
    ...campaign.value,
    ballotRules: { ...(campaign.value.ballotRules || DEFAULT_BALLOT_RULES) },
  }
  for (const key of Object.keys(times) as (keyof typeof times)[])
    times[key] = toAwardTimeInput(campaign.value[key])
  error.value = ''
  confirmPhase.value = null
  deleteOpen.value = false
  deleteTitle.value = ''
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
        @click="
          run(async () => {
            await awards.createCampaign()
            tab = 'settings'
          }, '已创建新一届活动草稿。')
        "
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
      </nav>
      <p v-if="error" class="award-admin-error" role="alert"><AppIcon name="info" :size="16" />{{ error }}</p>
      <div v-if="tab === 'settings'" class="award-admin-settings-grid">
        <form class="award-admin-card award-form" @submit.prevent="saveSettings">
          <div class="award-admin-card-heading">
            <div>
              <h2>名额与时间</h2>
              <p>初始名额为建议值，可在开放活动前调整。</p>
            </div>
            <AppIcon name="calendar" :size="21" />
          </div>
          <label>活动名称<input v-model="settings.title" maxlength="80" required :disabled="busy" /></label
          ><label
            >投票计分规则<select
              v-model="settings.votingRule"
              :disabled="rulesLocked || busy"
              @change="settings.votingRule === 'weighted-v1' && (settings.voteLimit = 3)"
            >
              <option value="weighted-v1">自定义加权投票：真爱票、喜爱票与推荐词</option>
              <option value="legacy">原规则：每部作品一票</option>
            </select></label
          >
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
            <label
              >每人最多提名<span class="award-number-input"
                ><input
                  v-model.number="settings.nominationLimit"
                  aria-label="每人最多提名"
                  type="number"
                  min="1"
                  max="100"
                  required
                  :disabled="rulesLocked"
                /><span>部</span></span
              ></label
            ><label
              >每人最多投票<span class="award-number-input"
                ><input
                  v-model.number="settings.voteLimit"
                  aria-label="每人最多投票"
                  type="number"
                  min="1"
                  max="100"
                  required
                  :disabled="rulesLocked || settings.votingRule === 'weighted-v1'"
                /><span>票</span></span
              ></label
            ><label
              >计划入选作品<span class="award-number-input"
                ><input
                  v-model.number="settings.winnerCount"
                  aria-label="计划入选作品"
                  type="number"
                  min="1"
                  max="100"
                  required
                  :disabled="rulesLocked"
                /><span>部</span></span
              ></label
            >
          </div>
          <p class="award-field-help">开放提名后，名额规则锁定，保证参与者使用相同规则。</p>
          <div class="award-time-group">
            <h3>提名阶段 <span>UTC+8</span></h3>
            <div>
              <label
                >提名开始时间<input
                  v-model="times.nominationStart"
                  type="datetime-local"
                  :disabled="settingsLocked" /></label
              ><label
                >提名结束时间<input
                  v-model="times.nominationEnd"
                  type="datetime-local"
                  :disabled="settingsLocked"
              /></label>
            </div>
          </div>
          <div class="award-time-group">
            <h3>投票阶段 <span>UTC+8</span></h3>
            <div>
              <label
                >投票开始时间<input
                  v-model="times.votingStart"
                  type="datetime-local"
                  :disabled="settingsLocked" /></label
              ><label
                >投票结束时间<input
                  v-model="times.votingEnd"
                  type="datetime-local"
                  :disabled="settingsLocked"
              /></label>
            </div>
          </div>
          <p class="award-field-help">
            时间可留空，前台显示“时间待公布”；填写时需同时指定开始与结束。阶段由管理员推进，提交操作同时遵守所设时间窗口。
          </p>
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
                <p>阶段按顺序开放，往届结果保留。</p>
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
            <template
              v-if="
                nextPhase && identity.can(nextPhase === 'archived' ? 'campaign.archive' : 'campaign.manage')
              "
              ><button class="button secondary full" :disabled="dirty" @click="confirmPhase = nextPhase">
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
                }}
              </p>
              <div>
                <button @click="confirmPhase = null">取消</button><button @click="advance">确认推进</button>
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
                  >{{ item.accountName }} · {{ item.studio || '制作组未填写' }} ·
                  {{ formatAwardTime(item.createdAt) }}</span
                >
              </div>
              <span :class="['award-status', item.status]">{{ statusNames[item.status] }}</span>
            </div>
            <blockquote>{{ item.reason }}</blockquote>
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
      <section class="award-admin-card">
        <h2>删除活动</h2>
        <p>删除后活动不再展示或接受投票，参与记录保留用于审计。此操作会影响所有参与者。</p>
        <button
          v-if="!deleteOpen"
          type="button"
          class="button secondary"
          :disabled="busy"
          @click="deleteOpen = true"
        >
          删除本届活动
        </button>
        <form v-else @submit.prevent="run(() => awards.deleteCampaign(deleteTitle), '活动已删除。')">
          <label
            >输入活动名称确认删除<input
              v-model="deleteTitle"
              :placeholder="campaign.title"
              :disabled="busy" /></label
          ><button type="button" class="button secondary" :disabled="busy" @click="deleteOpen = false">
            取消删除</button
          ><button type="submit" class="button primary" :disabled="busy || deleteTitle !== campaign.title">
            确认删除活动
          </button>
        </form>
      </section>
    </template>
  </div>
</template>
