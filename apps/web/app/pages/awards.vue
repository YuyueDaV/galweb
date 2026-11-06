<script setup lang="ts">
import { works, coverUrl } from '~/data/forum'
import { phaseNames, formatAwardTime, campaignWindowMessage } from '~/utils/awards'
import type { AwardCandidate } from '~/types/awards'

const awards = useAwards()
const route=useRoute()
const identity = usePreviewIdentity()
const { campaign, campaigns, selectedCampaignId, candidates, myNominations, myBallot, results } = awards
const { notify } = useForum()
const tab = ref('candidates')
const search = ref('')
const selected = ref<string[]>([])
const nominationDialog = ref<HTMLDialogElement | null>(null)
const formTitle = ref('')
const formStudio = ref('')
const formReason = ref('')
const formError = ref('')
const ballotError = ref('')
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined

onMounted(async () => { await awards.initialize(); const requested=route.query.campaign; if(typeof requested==='string'&&campaigns.value.some(item=>item.id===requested))selectedCampaignId.value=requested; clock = setInterval(() => { now.value = Date.now() }, 30000) })
onBeforeUnmount(() => { if (clock) clearInterval(clock) })
watch([myBallot, selectedCampaignId, identity.selectedId], () => { selected.value = [...(myBallot.value?.candidateIds || [])]; ballotError.value = ''; search.value = '' }, { immediate: true, deep: true })
const nominationCount = computed(() => myNominations.value.filter(item => item.status !== 'rejected').length)
const availableCandidates = computed(() => candidates.value.filter(candidate => `${candidate.title} ${candidate.studio}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const nominationWindow = computed(() => campaignWindowMessage(campaign.value, 'nomination', now.value))
const votingWindow = computed(() => campaignWindowMessage(campaign.value, 'voting', now.value))
const canNominate = computed(() => campaign.value.phase === 'nomination' && !nominationWindow.value)
const canVote = computed(() => campaign.value.phase === 'voting' && !votingWindow.value)
const ended = computed(() => ['results', 'archived'].includes(campaign.value.phase))
const winners = computed(() => results.value.filter(item => item.votes > 0 && item.rank <= campaign.value.winnerCount))
const title = computed(() => campaign.value.phase === 'voting' ? ['把你的喜欢，', '交给这一票。'] : ended.value ? ['每一份喜欢，', '都有了回响。'] : ['把你的那一部，', '提名给所有人。'])
const phaseIndex = computed(() => campaign.value.phase === 'draft' ? -1 : campaign.value.phase === 'nomination' ? 0 : campaign.value.phase === 'voting' ? 1 : 2)
const statusNames = { pending: '待审核', approved: '已通过', rejected: '已退回', withdrawn: '已撤回' }
const ballotChanged = computed(() => JSON.stringify([...selected.value].sort()) !== JSON.stringify([...(myBallot.value?.candidateIds || [])].sort()))
useSeoMeta({ title: () => `${campaign.value.title} · 澄之响` })

function selectEdition() { selected.value = []; tab.value = 'candidates'; awards.persist() }
function openNomination(title = '', studio = '') {
  if (!canNominate.value) { notify(nominationWindow.value || '活动尚未开放提名，请留意后续公告。'); return }
  formTitle.value = title; formStudio.value = studio; formReason.value = ''; formError.value = ''
  nominationDialog.value?.showModal()
}
async function submitNomination() {
  try { await awards.submitNomination(formTitle.value, formStudio.value, formReason.value); nominationDialog.value?.close(); tab.value = 'mine'; notify('提名已提交，等待管理员审核。') }
  catch (error) { formError.value = error instanceof Error ? error.message : '提名提交失败。' }
}
async function withdraw(id: string) {
  try { await awards.withdrawNomination(id); notify('已撤回这条提名，可以重新提交。') }
  catch (error) { notify(error instanceof Error ? error.message : '暂时无法撤回。') }
}
function toggleCandidate(candidate: AwardCandidate, event: Event) {
  const input = event.target as HTMLInputElement
  if (!canVote.value) { input.checked = selected.value.includes(candidate.id); return }
  ballotError.value = ''
  if (selected.value.includes(candidate.id)) selected.value = selected.value.filter(id => id !== candidate.id)
  else if (selected.value.length < campaign.value.voteLimit) selected.value.push(candidate.id)
  else ballotError.value = `本届每人最多选择 ${campaign.value.voteLimit} 部作品。`
  input.checked = selected.value.includes(candidate.id)
}
async function submitBallot() {
  try { await awards.saveBallot(selected.value); ballotError.value = ''; notify('选票已保存。投票结束前可以修改并重新提交。') }
  catch (error) { ballotError.value = error instanceof Error ? error.message : '选票提交失败。' }
}
async function withdrawBallot() {
  try { await awards.withdrawBallot(); selected.value = []; notify('已撤回本人选票。') }
  catch (error) { ballotError.value = error instanceof Error ? error.message : '暂时无法撤回。' }
}
</script>

<template>
  <div class="awards-page">
    <div class="award-page-top"><span class="page-kicker"><span class="category-dot orange"></span> THE TWELVE ORANGES · COMMUNITY AWARDS</span><label class="award-edition-select"><span class="sr-only">选择活动届次</span><select v-model="selectedCampaignId" @change="selectEdition"><option v-for="item in campaigns" :key="item.id" :value="item.id">第 {{ item.edition }} 届 · {{ phaseNames[item.phase] }}</option></select></label></div>
    <section class="award-hero"><div><div class="award-hero-label"><span class="award-edition-pill">第 {{ campaign.edition }} 届十二橙器</span><span class="award-phase-dot"><span class="status-dot"></span>{{ phaseNames[campaign.phase] }}</span></div><h1>{{ title[0] }}<br><span>{{ title[1] }}</span></h1><p>由同好提名，用喜欢投票。<br>一起写下属于澄之响的新一届视觉小说书单。</p><div class="award-hero-actions"><button v-if="canNominate" class="button primary" @click="openNomination()"><AppIcon name="plus" :size="17" />提名我喜欢的作品</button><a v-else-if="canVote" href="#award-candidates" class="button primary">为喜欢的作品投票<AppIcon name="arrowRight" :size="17" /></a><a v-else-if="ended" href="#award-results" class="button primary">查看本届结果<AppIcon name="trophy" :size="17" /></a><span v-else class="award-pending-text"><AppIcon name="calendar" :size="17" />{{ campaign.phase === 'voting' ? (votingWindow || '投票时间待公布') : (nominationWindow || '提名时间待公布') }}</span><NuxtLink to="/ranking" class="text-link">回顾第一届<AppIcon name="arrowUpRight" :size="16" /></NuxtLink></div></div><div class="award-hero-art" aria-hidden="true"><span class="award-huge-number">{{ String(campaign.edition).padStart(2, '0') }}</span><span class="award-art-leaf">✳</span><div class="award-art-seal"><AppIcon name="trophy" :size="42" /><span>NOMINATE.<br>VOTE. RESONATE.</span></div><span class="award-art-foot">YOUR FAVOURITE STORY DESERVES TO BE SEEN.</span></div></section>
    <div class="award-prototype-notice"><AppIcon name="info" :size="15" /><span>提名与选票由服务器保存，投票结束后统一公布结果。</span><NuxtLink v-if="identity.can('campaign.manage')" to="/admin/awards">管理活动<AppIcon name="arrowUpRight" :size="14" /></NuxtLink></div>
    <ol class="award-stepper" aria-label="活动流程"><li v-for="(label, index) in ['提名阶段', '投票阶段', '结果公布']" :key="label" :class="{ current: phaseIndex === index, complete: phaseIndex > index }"><span class="award-step-number"><AppIcon v-if="phaseIndex > index" name="check" :size="17" /><template v-else>{{ String(index + 1).padStart(2, '0') }}</template></span><div><strong>{{ label }}</strong><span>{{ index === 0 ? (campaign.nominationStart ? `${formatAwardTime(campaign.nominationStart)} — ${formatAwardTime(campaign.nominationEnd)}` : '时间待公布') : index === 1 ? (campaign.votingStart ? `${formatAwardTime(campaign.votingStart)} — ${formatAwardTime(campaign.votingEnd)}` : '时间待公布') : '投票结束后，由管理员公布' }}</span></div></li></ol>
    <div class="awards-layout">
      <div class="award-main">
        <section v-if="ended" id="award-results" class="award-results-section"><div class="section-heading"><div><p class="eyebrow">THE STORIES YOU CHOSE</p><h2>本届的共同选择<span class="heading-dot">。</span></h2></div><span class="muted">{{ awards.ballotCount.value }} 份选票</span></div><div v-if="!winners.length" class="empty-state"><AppIcon name="trophy" :size="30" /><h3>本届还没有有效得票结果</h3><p>不会用示例票数生成正式排名。</p></div><div v-else class="award-result-list"><article v-for="item in winners" :key="item.id" class="award-result-row"><span class="award-result-rank">{{ String(item.rank).padStart(2, '0') }}</span><div class="award-result-cover"><img v-if="item.coverRank" :src="coverUrl(item.coverRank)" :alt="`${item.title}封面`" /><AppIcon v-else name="book" :size="25" /></div><div><h3>{{ item.title }}</h3><span>{{ item.studio || '成员提名作品' }}<span v-if="winners.filter(other => other.votes === item.votes).length > 1"> · 同票并列</span></span></div><strong>{{ item.votes }}<small>票</small></strong></article></div><p class="award-small-note">同票作品按相同名次并列展示；入选名额边界出现同票时，入选数量可能超过计划名额。</p></section>
        <section id="award-candidates"><div class="section-heading"><div><p class="eyebrow">OUR NEXT COLLECTIVE MEMORY</p><h2>{{ ended ? '所有提名的故事' : campaign.phase === 'voting' ? '正式候选名单' : '这一次，为喜欢提名' }}<span class="heading-dot">。</span></h2></div><span class="award-candidate-total">{{ candidates.length }} 部已通过审核</span></div><div class="award-board-toolbar"><div class="award-tabs" role="group" aria-label="活动列表"><button :class="{ active: tab === 'candidates' }" :aria-pressed="tab === 'candidates'" @click="tab = 'candidates'">候选作品</button><button :class="{ active: tab === 'mine' }" :aria-pressed="tab === 'mine'" @click="tab = 'mine'">我的提名 <span>{{ myNominations.length }}</span></button><button :class="{ active: tab === 'ballot' }" :aria-pressed="tab === 'ballot'" @click="tab = 'ballot'">我的选票</button></div><label v-if="tab === 'candidates'" class="award-search"><AppIcon name="search" :size="15" /><input v-model="search" placeholder="搜索候选作品" aria-label="搜索候选作品" /></label></div>
          <template v-if="tab === 'candidates'"><div v-if="!availableCandidates.length" class="empty-state award-empty"><span class="award-empty-spark">✳</span><h3>{{ search ? '没有找到这部作品' : campaign.phase === 'draft' ? '下一届故事，正在准备中' : '第一份提名，也许就来自你' }}</h3><p>{{ search ? '换个关键词试试。' : campaign.phase === 'draft' ? '名额和时间由管理员确认后公布，先翻翻第一届的书单吧。' : '审核通过的提名会出现在这里，成为本届的正式候选作品。' }}</p><button v-if="canNominate" class="button secondary" @click="openNomination()">提交一份提名<AppIcon name="plus" :size="15" /></button><NuxtLink v-else-if="campaign.phase === 'draft'" to="/ranking" class="button secondary">回顾第一届书单<AppIcon name="arrowUpRight" :size="15" /></NuxtLink></div><div v-else class="award-candidate-grid"><article v-for="item in availableCandidates" :key="item.id" class="award-candidate-card" :class="{ chosen: selected.includes(item.id) && campaign.phase === 'voting' }"><div class="award-candidate-cover"><img v-if="item.coverRank" :src="coverUrl(item.coverRank)" :alt="`${item.title}封面`" loading="lazy" /><div v-else class="award-no-cover"><AppIcon name="book" :size="32" /><span>每一个故事，都有它的位置。</span></div><span class="award-nomination-count">{{ item.nominations.length }} 人提名</span></div><div class="award-candidate-copy"><span>{{ item.studio || '成员推荐' }}</span><h3>{{ item.title }}</h3><p>{{ item.nominations[0]?.reason }}</p><label v-if="campaign.phase === 'voting'" class="award-vote-choice"><input type="checkbox" :checked="selected.includes(item.id)" :disabled="!canVote" :aria-label="`投票给${item.title}`" @change="toggleCandidate(item, $event)" /><span>{{ selected.includes(item.id) ? '已加入选票' : '选入我的选票' }}</span></label><button v-else-if="canNominate" class="text-link" @click="openNomination(item.title, item.studio)">我也想提名<AppIcon name="plus" :size="14" /></button></div></article></div></template>
          <template v-else-if="tab === 'mine'"><div v-if="!myNominations.length" class="empty-state"><AppIcon name="pen" :size="28" /><h3>让你的喜欢，被更多人看见</h3><p>本届每人可提名 {{ campaign.nominationLimit }} 部作品，提交后由管理员审核。</p><button v-if="canNominate" class="button secondary" @click="openNomination()">写下第一份提名<AppIcon name="plus" :size="15" /></button></div><div v-else class="award-my-nominations"><article v-for="item in myNominations" :key="item.id"><div class="award-my-nomination-top"><h3>{{ item.title }}</h3><span :class="['award-status', item.status]">{{ statusNames[item.status] }}</span></div><p>{{ item.reason }}</p><p v-if="item.reviewNote" class="award-review-note">管理员反馈：{{ item.reviewNote }}</p><div><span>{{ formatAwardTime(item.createdAt) }}</span><button v-if="canNominate && item.status !== 'rejected'" @click="withdraw(item.id)">撤回提名</button><button v-if="canNominate && item.status === 'rejected'" @click="openNomination(item.title, item.studio)">修改后重新提名</button></div></article></div></template>
          <template v-else><div v-if="!myBallot" class="empty-state"><AppIcon name="check" :size="28" /><h3>你的这一票，还在等候</h3><p>{{ campaign.phase === 'voting' ? '到候选名单选择喜欢的作品，再提交你的选票。' : '投票开放后，可以在这里查看已提交的选票。' }}</p><button v-if="canVote" class="button secondary" @click="tab = 'candidates'">去选择作品<AppIcon name="arrowRight" :size="15" /></button></div><div v-else class="award-ballot-receipt"><div><span class="award-ballot-check"><AppIcon name="check" :size="24" /></span><h3>你的喜欢，已经收到。</h3><p>共选择 {{ myBallot.candidateIds.length }} 部作品 · {{ formatAwardTime(myBallot.updatedAt) }}</p></div><ul><li v-for="id in myBallot.candidateIds" :key="id"><AppIcon name="book" :size="16" />{{ candidates.find(item => item.id === id)?.title || '候选作品' }}</li></ul><button v-if="canVote" class="text-link" @click="tab = 'candidates'">修改我的选票<AppIcon name="pen" :size="15" /></button><p v-else class="award-small-note">本阶段选票已锁定，无法再修改。</p></div></template>
        </section>
        <section v-if="campaign.phase === 'voting'" class="award-ballot-bar" aria-label="我的当前选票"><div><strong>已选 {{ selected.length }}<span>/ {{ campaign.voteLimit }} 部</span></strong><p>{{ myBallot ? ballotChanged ? '选票已修改，请重新提交保存。' : '已提交，投票结束前仍可修改。' : '每部作品一票，不必用满名额。' }}</p></div><div><button v-if="myBallot && canVote" class="award-text-button" @click="withdrawBallot">撤回选票</button><button v-else class="award-text-button" :disabled="!selected.length" @click="selected = []; ballotError = ''">清空选择</button><button class="button primary" :disabled="!canVote || !selected.length || (!!myBallot && !ballotChanged)" @click="submitBallot">{{ myBallot ? '保存选票修改' : '提交我的选票' }}<AppIcon name="send" :size="16" /></button></div><p v-if="ballotError || votingWindow" class="form-error" role="alert">{{ ballotError || votingWindow }}</p></section>
      </div>
      <aside class="award-rail"><section id="award-rules" class="rail-card award-rule-card"><p class="eyebrow">HOW TO JOIN</p><h2>这届，怎么参与？</h2><ol><li><span>01</span><div><strong>提名喜欢的作品</strong><p>每人最多 {{ campaign.nominationLimit }} 部，附上推荐理由。审核通过后进入候选名单。</p></div></li><li><span>02</span><div><strong>为心中的作品投票</strong><p>每人最多选 {{ campaign.voteLimit }} 部，每部一票。投票结束前可修改，以最后提交为准。</p></div></li><li><span>03</span><div><strong>一起见证新书单</strong><p>计划选出 {{ campaign.winnerCount }} 部作品，得票同票并列，投票期间不公开票数。</p></div></li></ol><p class="award-rule-footer">名额与时间由管理员配置。所有提名默认需审核，当前日期与时间均按 UTC+8 显示。</p></section><section class="rail-card award-my-progress"><h2>我的参与进度</h2><div><span>本届提名</span><strong>{{ nominationCount }} / {{ campaign.nominationLimit }}</strong></div><div><span>我的选票</span><strong>{{ myBallot ? '已提交' : '未提交' }}</strong></div><span class="award-identity-label">{{ identity.account.value.name }} · {{ identity.roleNames[identity.role.value] }}</span></section><NuxtLink to="/ranking" class="award-archive-card"><span class="eyebrow">PREVIOUS EDITION</span><h2>第一届十二橙器</h2><p>那些被共同喜欢过的故事。</p><div class="award-archive-covers"><img v-for="rank in [1, 2, 3]" :key="rank" :src="coverUrl(rank)" alt="第一届入选作品封面" loading="lazy" /></div><span class="text-link">翻开已公布的结果<AppIcon name="arrowUpRight" :size="15" /></span></NuxtLink></aside>
    </div>
    <dialog ref="nominationDialog" class="modal award-nomination-dialog" aria-labelledby="nomination-title"><div class="modal-heading"><div><p class="eyebrow">A STORY WORTH SHARING</p><h2 id="nomination-title">替喜欢的作品，写一封推荐信。</h2></div><button class="icon-button" aria-label="关闭提名窗口" @click="nominationDialog?.close()"><AppIcon name="close" /></button></div><form class="award-form" @submit.prevent="submitNomination"><label>作品名称<input v-model="formTitle" list="award-known-works" maxlength="80" required placeholder="输入作品名称，也可以提名书架之外的作品" /></label><datalist id="award-known-works"><option v-for="work in works" :key="work.rank" :value="work.title" /></datalist><label>制作组 <span>选填</span><input v-model="formStudio" maxlength="80" placeholder="例如：Key、TYPE-MOON" /></label><label>推荐理由 <span>10–600 字，请避免关键剧透</span><textarea v-model="formReason" rows="5" minlength="10" maxlength="600" required placeholder="哪一个瞬间，让你想把它推荐给大家？"></textarea></label><p v-if="formError" class="form-error" role="alert">{{ formError }}</p><div class="award-form-bottom"><span>已提名 {{ nominationCount }} / {{ campaign.nominationLimit }} 部 · 提交后进入审核</span><button class="button primary" type="submit">提交提名<AppIcon name="send" :size="16" /></button></div></form></dialog>
  </div>
</template>
