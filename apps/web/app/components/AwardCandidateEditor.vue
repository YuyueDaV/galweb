<script setup lang="ts">
import type { AwardCandidate, AwardNomination } from '~/types/awards'
import type { Work } from '~/types/forum'
import { formatAwardTime } from '~/utils/awards'

const props = defineProps<{ candidate: AwardCandidate; campaignId: string; catalog: Work[] }>()
const emit = defineEmits<{ updated: [] }>()
const auth = useAuth(),
  awards = useAwards(),
  { notify } = useForum()
const dialog = ref<HTMLDialogElement | null>(null)
const work = ref<Work | null>(null)
const submissions = ref<
  { id: string; accountName: string; createdAt: string; workSource: AwardNomination['workSource'] | null }[]
>([])
const linkWorkId = ref<number | null>(null),
  linkConfirmed = ref(false),
  linking = ref(false)
const linkError = ref('')
const linkTarget = computed(() => props.catalog.find((item) => item.rank === linkWorkId.value))
const canLink = computed(() => ['draft', 'nomination'].includes(awards.campaign.value.phase))
const sourceNames = { catalog: '从书库选择', bangumi: '从 Bangumi 导入', manual: '手动填写后匹配书库' }
const loading = ref(false),
  saving = ref(false),
  coverBusy = ref(false),
  error = ref('')
const locked = computed(() => loading.value || saving.value || coverBusy.value || linking.value)
const allowed = computed(() => auth.user.value?.role === 'super_admin')
const form = reactive({ title: '', subtitle: '', studio: '', description: '' })
async function open() {
  if (!allowed.value || locked.value) return
  error.value = ''
  work.value = null
  submissions.value = []
  linkWorkId.value = null
  linkConfirmed.value = false
  linkError.value = ''
  dialog.value?.showModal()
  loading.value = true
  try {
    const endpoint = '/admin/award-campaigns/' + props.campaignId + '/candidates/' + props.candidate.id
    type CandidateInfo = { work: Work; submissions: typeof submissions.value }
    let info: CandidateInfo
    try {
      info = await auth.request<CandidateInfo>(endpoint)
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e
      const prepared = await auth.request<{ workId: number; candidateId: string; created: boolean }>(
        endpoint + '/library',
        {},
      )
      if (prepared.candidateId !== props.candidate.id) {
        await awards.refresh()
        emit('updated')
        dialog.value?.close()
        notify('已关联已有书库并合并重复候选，请从合并后的作品打开编辑。')
        return
      }
      info = await auth.request<CandidateInfo>(endpoint)
      await awards.refresh()
      emit('updated')
      notify(prepared.created ? '已自动补录书库并关联这部作品。' : '已找到并关联已有书库作品。')
    }
    const data = info.work
    work.value = data
    submissions.value = info.submissions
    Object.assign(form, {
      title: data.title,
      subtitle: data.subtitle || '',
      studio: data.studio,
      description: data.description || '',
    })
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
function close() {
  if (!locked.value) dialog.value?.close()
}
async function save() {
  if (!work.value || locked.value) return
  saving.value = true
  error.value = ''
  try {
    await auth.request(
      '/admin/award-campaigns/' + props.campaignId + '/candidates/' + props.candidate.id,
      { ...form, workId: work.value.rank, version: work.value.version || 0 },
      'PATCH',
    )
    await awards.refresh()
    emit('updated')
    dialog.value?.close()
    notify('作品资料已更新，候选编号和已有选票保留。')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
function coverUpdated(data: Work) {
  work.value = { ...work.value, ...data }
  emit('updated')
}
async function linkWork() {
  const target = linkTarget.value,
    current = work.value
  if (!target || !current || !linkConfirmed.value || locked.value || !canLink.value) return
  linking.value = true
  linkError.value = ''
  try {
    const result = await auth.request<{ merged: boolean }>(
      '/admin/award-campaigns/' + props.campaignId + '/candidates/' + props.candidate.id + '/work',
      {
        currentWorkId: current.rank,
        currentVersion: current.version || 0,
        workId: target.rank,
        version: target.version || 0,
      },
      'PATCH',
    )
    await awards.refresh()
    emit('updated')
    dialog.value?.close()
    notify(
      result.merged ? '已关联已有书库作品，并合并本届提名记录。' : '已更正书库关联，提名人和审核状态保留。',
    )
  } catch (e) {
    linkError.value = (e as Error).message
  } finally {
    linking.value = false
  }
}
watch(linkWorkId, () => {
  linkConfirmed.value = false
})
</script>

<template>
  <div v-if="allowed" class="candidate-edit-control">
    <button type="button" class="button secondary" @click="open">
      <AppIcon name="pen" :size="16" />编辑作品
    </button>
    <dialog
      ref="dialog"
      class="modal candidate-edit-dialog"
      :aria-labelledby="`candidate-edit-title-${candidate.id}`"
      @cancel.prevent="close"
    >
      <header>
        <div>
          <p class="eyebrow">超级管理员 · 已提名作品</p>
          <h2 :id="`candidate-edit-title-${candidate.id}`">编辑作品资料</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="关闭作品编辑窗口"
          :disabled="locked"
          @click="close"
        >
          <AppIcon name="close" />
        </button>
      </header>
      <p class="candidate-edit-help">
        名称与会社同步到本届提名，作品资料同步到书库；作品编号、审核状态和已有选票保留。
      </p>
      <p v-if="loading" role="status">正在加载作品资料…</p>
      <nav v-if="work" class="candidate-library-links" aria-label="书库快捷入口">
        <NuxtLink
          class="button secondary"
          :to="'/works/' + work.rank"
          target="_blank"
          rel="noopener noreferrer"
          ><AppIcon name="book" :size="16" />查看书库作品<AppIcon name="arrowUpRight" :size="15"
        /></NuxtLink>
        <NuxtLink
          class="button secondary"
          :to="{ path: '/admin/works', query: { work: work.rank } }"
          target="_blank"
          rel="noopener noreferrer"
          ><AppIcon name="pen" :size="16" />编辑书库资料<AppIcon name="arrowUpRight" :size="15"
        /></NuxtLink>
        <small>在新标签页打开，保留当前窗口的未保存内容。</small>
      </nav>
      <section v-if="work" class="candidate-source-panel">
        <h3>作品来源</h3>
        <p>
          当前关联：<NuxtLink :to="'/works/' + work.rank">书库 #{{ work.rank }} · {{ work.title }}</NuxtLink>
        </p>
        <p>收录人：{{ work.addedBy?.name || '历史书库资料' }}</p>
        <p v-if="work.bangumi">
          Bangumi 条目：<a
            :href="'https://bgm.tv/subject/' + work.bangumi.id"
            target="_blank"
            rel="noopener noreferrer"
            >#{{ work.bangumi.id }} · {{ work.bangumi.originalTitle || work.bangumi.title }} ↗</a
          >
        </p>
        <p v-else>尚未关联 Bangumi，当前以书库编号识别作品。</p>
        <details>
          <summary>查看原提交来源（{{ submissions.length }} 条）</summary>
          <p v-for="submission in submissions" :key="submission.id">
            {{ submission.accountName }} · {{ formatAwardTime(submission.createdAt) }}<br />{{
              submission.workSource
                ? `${sourceNames[submission.workSource.kind]} · 原关联书库 #${submission.workSource.workId} · ${submission.workSource.title}`
                : '旧记录未保存提交方式，当前关联以上方书库编号为准。'
            }}<span v-if="submission.workSource?.subjectId">
              · Bangumi #{{ submission.workSource.subjectId }}</span
            >
          </p>
        </details>
      </section>
      <form v-if="work" class="candidate-edit-form" @submit.prevent="save">
        <fieldset class="plain-fieldset" :disabled="locked">
          <label class="community-field"
            >作品名称<input v-model="form.title" required maxlength="160"
          /></label>
          <label class="community-field">原名／副标题<input v-model="form.subtitle" maxlength="160" /></label>
          <label class="community-field">制作组／会社<input v-model="form.studio" maxlength="200" /></label>
          <label class="community-field"
            >作品简介<textarea v-model="form.description" rows="4" maxlength="8000"></textarea>
          </label>
        </fieldset>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <footer>
          <button type="button" class="button secondary" :disabled="locked" @click="close">取消</button
          ><button type="submit" class="button primary" :disabled="locked">
            {{ saving ? '正在保存…' : '保存作品资料' }}
          </button>
        </footer>
      </form>
      <p v-else-if="error" class="form-error" role="alert">{{ error }}</p>
      <template v-if="work">
        <form class="candidate-source-panel" @submit.prevent="linkWork">
          <h3>更正书库关联</h3>
          <p class="candidate-edit-help">
            重复或来源选错时，选择已有作品复用。本届已有该作品时合并提名人及提名词；原书库条目保留，不新增作品。
          </p>
          <fieldset class="plain-fieldset" :disabled="locked || !canLink">
            <label class="community-field"
              >关联已有书库作品<select v-model="linkWorkId">
                <option :value="null">请选择正确的书库作品</option>
                <option
                  v-for="item in catalog.filter((item) => item.rank !== work!.rank)"
                  :key="item.rank"
                  :value="item.rank"
                >
                  {{ item.title }} · 书库 #{{ item.rank
                  }}{{ item.bangumi ? ` · Bangumi #${item.bangumi.id}` : '' }}
                </option>
              </select></label
            >
            <label v-if="linkTarget" class="inline-check"
              ><input v-model="linkConfirmed" type="checkbox" />确认将本作全部提名关联到《{{
                linkTarget.title
              }}》，如本届已有该作品则合并。</label
            >
            <button type="submit" class="button secondary" :disabled="!linkTarget || !linkConfirmed">
              {{ linking ? '正在更正…' : '保存书库关联' }}
            </button>
          </fieldset>
          <p v-if="!canLink" class="candidate-edit-help">
            投票已开始，只能修改作品资料，不能更换作品身份或合并候选。
          </p>
          <p v-if="linkError" class="form-error" role="alert">{{ linkError }}</p>
        </form>
        <WorkCoverEditor
          :work="work"
          embedded
          :disabled="loading || saving || linking"
          @updated="coverUpdated"
          @busy="coverBusy = $event"
        />
        <p class="candidate-edit-help">封面选择后单独保存；上方文字资料需点击“保存作品资料”。</p>
        <NuxtLink
          class="text-link"
          :to="{ path: '/admin/awards', query: { campaign: campaignId, candidate: candidate.id } }"
          >管理本作提名人和提名词<AppIcon name="arrowRight" :size="16"
        /></NuxtLink>
      </template>
    </dialog>
  </div>
</template>

<style scoped>
.candidate-edit-control {
  margin-top: 0.6rem;
}
.candidate-edit-control > .button {
  width: 100%;
  min-height: 44px;
  font-size: 14px;
  justify-content: center;
}
.candidate-edit-dialog {
  box-sizing: border-box;
  width: min(44rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: clamp(20px, 3vw, 32px);
  overflow-y: auto;
  border-radius: 24px;
}
.candidate-edit-dialog header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.candidate-edit-dialog h2 {
  font-size: 24px;
  line-height: 1.5;
  margin-block: 8px;
}
.candidate-edit-dialog .icon-button {
  flex-shrink: 0;
}
.candidate-edit-help {
  color: var(--subtle);
  font-size: 14px;
  line-height: 1.8;
}
.candidate-library-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-block: 16px;
}
.candidate-library-links .button {
  min-height: 44px;
  font-size: 14px;
  justify-content: center;
}
.candidate-library-links small {
  flex-basis: 100%;
  color: var(--subtle);
  font-size: 13px;
  line-height: 1.7;
}
.candidate-source-panel {
  margin-block: 20px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
  overflow-wrap: anywhere;
}
.candidate-source-panel h3 {
  margin: 0 0 12px;
  font-size: 17px;
}
.candidate-source-panel p,
.candidate-source-panel summary,
.candidate-source-panel label {
  font-size: 14px;
  line-height: 1.8;
}
.candidate-source-panel a {
  color: var(--orange);
}
.candidate-source-panel .button {
  margin-top: 12px;
  min-height: 44px;
  font-size: 14px;
}
.candidate-source-panel select {
  width: 100%;
  min-width: 0;
  font-size: 16px;
}
.candidate-edit-form input,
.candidate-edit-form textarea {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  font-size: 16px;
}
.candidate-edit-form footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-block: 20px;
}
.candidate-edit-dialog > .text-link {
  font-size: 14px;
}
@media (max-width: 599px) {
  .candidate-library-links .button {
    width: 100%;
  }
  .candidate-edit-form footer {
    display: grid;
    grid-template-columns: 1fr;
  }
  .candidate-edit-form footer .button {
    justify-content: center;
  }
}
</style>
