<script setup lang="ts">
import type { AwardCandidate } from '~/types/awards'
import type { Work } from '~/types/forum'

const props = defineProps<{ candidate: AwardCandidate; campaignId: string }>()
const emit = defineEmits<{ updated: [] }>()
const auth = useAuth(),
  awards = useAwards(),
  { notify } = useForum()
const dialog = ref<HTMLDialogElement | null>(null)
const work = ref<Work | null>(null)
const loading = ref(false),
  saving = ref(false),
  coverBusy = ref(false),
  error = ref('')
const locked = computed(() => loading.value || saving.value || coverBusy.value)
const allowed = computed(() => auth.user.value?.role === 'super_admin')
const form = reactive({ title: '', subtitle: '', studio: '', description: '' })
async function open() {
  if (!allowed.value || locked.value) return
  error.value = ''
  work.value = null
  dialog.value?.showModal()
  loading.value = true
  try {
    if (!props.candidate.coverRank) throw new Error('该候选作品尚未关联书库资料。')
    const data = await auth.request<Work>('/works/' + props.candidate.coverRank)
    work.value = data
    Object.assign(form, {
      title: props.candidate.title,
      subtitle: data.subtitle || '',
      studio: props.candidate.studio,
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
      { ...form, version: work.value.version || 0 },
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
        <WorkCoverEditor
          :work="work"
          embedded
          :disabled="loading || saving"
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
  .candidate-edit-form footer {
    display: grid;
    grid-template-columns: 1fr;
  }
  .candidate-edit-form footer .button {
    justify-content: center;
  }
}
</style>
