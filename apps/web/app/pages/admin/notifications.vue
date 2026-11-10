<script setup lang="ts">
type SentNotice = {
  id: string
  kind: string
  title: string
  content: string
  link: string
  sender: string
  recipientCount: number
  createdAt: number
  revision: string
}
const auth = useAuth(),
  inbox = useNotifications(),
  { loginOpen } = useForum()
const allowed = computed(() => !!auth.user.value && auth.user.value.role !== 'member')
const loading = ref(true),
  busy = ref(false),
  confirming = ref(false),
  error = ref(''),
  success = ref('')
const title = ref(''),
  content = ref(''),
  link = ref(''),
  requestId = ref('')
const items = ref<SentNotice[]>([]),
  page = ref(1),
  total = ref(0),
  activeUsers = ref(0)
const managementDialog = ref<HTMLDialogElement | null>(null)
const managedNotice = ref<SentNotice | null>(null)
const managementMode = ref<'edit' | 'delete'>('edit')
const managementBusy = ref(false),
  managementError = ref('')
const draft = reactive({ title: '', content: '', link: '' })
async function openManagement(item: SentNotice, mode: 'edit' | 'delete') {
  if (busy.value || managementBusy.value) return
  managedNotice.value = { ...item }
  managementMode.value = mode
  managementError.value = ''
  Object.assign(draft, { title: item.title, content: item.content, link: item.link })
  await nextTick()
  managementDialog.value?.showModal()
}
function closeManagement() {
  if (managementBusy.value) return
  managementDialog.value?.close()
  managedNotice.value = null
}
async function saveManagement() {
  if (managementBusy.value || !managedNotice.value) return
  managementBusy.value = true
  managementError.value = ''
  const item = managedNotice.value,
    deleting = managementMode.value === 'delete'
  try {
    await auth.request(
      '/admin/notifications/' + item.id,
      deleting ? { revision: item.revision } : { ...draft, revision: item.revision },
      deleting ? 'DELETE' : 'PATCH',
    )
    success.value = deleting
      ? '通知已删除，已从所有用户的收件箱移除。'
      : '通知已更新，用户收件箱已同步，原已读状态保留。'
    managementDialog.value?.close()
    managedNotice.value = null
    await load()
    await inbox.load(1, true).catch(() => {})
  } catch (e) {
    managementError.value = (e as Error).message
  } finally {
    managementBusy.value = false
  }
}
let generation = 0
async function load() {
  const run = ++generation
  loading.value = true
  error.value = ''
  try {
    await auth.initialize()
    if (!allowed.value) {
      items.value = []
      return
    }
    const result = await auth.request<{ items: SentNotice[]; total: number; activeUsers: number }>(
      '/admin/notifications?page=' + page.value,
    )
    if (run !== generation) return
    items.value = result.items
    total.value = result.total
    activeUsers.value = result.activeUsers
    const lastPage = Math.max(1, Math.ceil(result.total / 20))
    if (page.value > lastPage) page.value = lastPage
  } catch (e) {
    if (run === generation) error.value = (e as Error).message
  } finally {
    if (run === generation) loading.value = false
  }
}
function preview() {
  error.value = ''
  success.value = ''
  if (
    link.value &&
    (!/^\/(?!\/)/.test(link.value) ||
      /[\\\s]/.test(link.value) ||
      [...link.value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))
  ) {
    error.value = '跳转链接必须是以 / 开头的站内路径，例如 /awards。'
    return
  }
  confirming.value = true
}
async function send() {
  if (busy.value || !confirming.value) return
  busy.value = true
  error.value = ''
  success.value = ''
  try {
    requestId.value ||= crypto.randomUUID()
    const result = await auth.request<{ recipientCount: number }>('/admin/notifications', {
      requestId: requestId.value,
      title: title.value,
      content: content.value,
      link: link.value,
    })
    success.value = `通知已发送，覆盖 ${result.recipientCount} 个账号。`
    title.value = ''
    content.value = ''
    link.value = ''
    requestId.value = ''
    confirming.value = false
    if (page.value === 1) await load()
    else page.value = 1
    await inbox.load(1, true).catch(() => {})
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
watch(page, load)
watch(
  () => auth.user.value?.id,
  () => {
    items.value = []
    confirming.value = false
    requestId.value = ''
    managementDialog.value?.close()
    managedNotice.value = null
    void load()
  },
)
onMounted(load)
useSeoMeta({ title: '站点通知管理 · 澄之响', robots: 'noindex,nofollow' })
</script>

<template>
  <div class="experience-page notices-admin">
    <header class="experience-heading">
      <div>
        <p class="eyebrow">A MESSAGE FOR EVERYONE</p>
        <h1>站点通知<span>。</span></h1>
        <p>把重要的消息，送到每位同好身边。</p>
      </div>
    </header>
    <p v-if="loading" role="status">正在加载通知管理…</p>
    <div v-else-if="!auth.user.value" class="empty-state">
      <p>请登录管理员账号后发送通知。</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
    <div v-else-if="!allowed" class="empty-state">只有管理员和超级管理员可以发送站点通知。</div>
    <template v-if="allowed">
      <form class="experience-card notice-composer" @submit.prevent="preview">
        <div class="notice-card-heading">
          <h2>发送全站通知</h2>
          <span class="catalog-help">当前 {{ activeUsers }} 个正常账号</span>
        </div>
        <p class="catalog-help">通知将出现在用户的消息列表中，并计入未读提醒。</p>
        <fieldset class="notice-fields" :disabled="busy || confirming">
          <label class="community-field"
            >通知标题<input
              v-model.trim="title"
              required
              maxlength="80"
              placeholder="给这条消息一个清楚的标题"
          /></label>
          <label class="community-field"
            >通知正文<textarea
              v-model.trim="content"
              required
              maxlength="2000"
              rows="6"
              placeholder="写下通知的具体内容…"
            ></textarea>
          </label>
          <label class="community-field"
            >站内跳转链接（选填）<input v-model.trim="link" maxlength="200" placeholder="例如 /awards"
          /></label>
        </fieldset>
        <p v-if="!confirming" class="catalog-help">十二橙器开放提名、开放投票、二次投票、每轮同票加赛、公布结果及归档时会自动通知，无需重复发送。</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <section v-if="confirming" class="notice-preview" aria-label="通知预览">
          <p class="eyebrow">发送前确认</p>
          <h3>{{ title }}</h3>
          <p class="notice-content">{{ content }}</p>
          <small v-if="link">跳转至 {{ link }}</small>
          <p class="catalog-help">将发送给所有正常账号。发送后可在下方记录中编辑或删除。</p>
          <div class="notice-actions">
            <button type="button" class="button secondary" :disabled="busy" @click="confirming = false">
              返回编辑</button
            ><button type="button" class="button primary" :disabled="busy" @click="send">
              {{ busy ? '正在发送…' : '确认发送给全体用户' }}
            </button>
          </div>
        </section>
        <button v-else class="button primary" type="submit" :disabled="loading || busy || !title || !content">
          预览通知
        </button>
      </form>
      <p v-if="success" class="notice-success" role="status">{{ success }}</p>
      <section class="experience-card notice-history">
        <div class="notice-card-heading">
          <h2>发送记录</h2>
          <button type="button" class="text-link" :disabled="loading || busy" @click="load">刷新记录</button>
        </div>
        <p v-if="!items.length && !loading" class="catalog-help">还没有发送记录。</p>
        <article v-for="item in items" :key="item.id" class="sent-notice">
          <p class="notice-meta">
            {{ item.kind === 'activity' ? '活动自动通知' : '站点通知' }} · {{ item.sender }} ·
            {{ new Date(Number(item.createdAt)).toLocaleString('zh-CN') }} · {{ item.recipientCount }} 个账号
          </p>
          <h3>{{ item.title }}</h3>
          <p class="notice-content">{{ item.content }}</p>
          <NuxtLink v-if="item.link" :to="item.link" class="text-link">查看关联页面 ↗</NuxtLink>
          <div class="notice-record-actions">
            <button
              type="button"
              class="button secondary"
              :disabled="loading || busy || managementBusy"
              @click="openManagement(item, 'edit')"
            >
              <AppIcon name="pen" :size="16" />编辑通知
            </button>
            <button
              type="button"
              class="button secondary danger-outline"
              :disabled="loading || busy || managementBusy"
              @click="openManagement(item, 'delete')"
            >
              删除通知
            </button>
          </div>
        </article>
        <div v-if="total > 20" class="page-controls">
          <button :disabled="page === 1 || loading || busy" @click="page--">上一页</button
          ><span>{{ page }}</span
          ><button :disabled="page * 20 >= total || loading || busy" @click="page++">下一页</button>
        </div>
      </section>
      <dialog
        ref="managementDialog"
        class="modal notice-management-dialog"
        aria-labelledby="notice-management-title"
        @cancel.prevent="closeManagement"
      >
        <template v-if="managedNotice">
          <div class="notice-card-heading">
            <h2 id="notice-management-title">{{ managementMode === 'edit' ? '编辑通知' : '删除通知' }}</h2>
            <button
              type="button"
              class="icon-button"
              aria-label="关闭通知管理窗口"
              :disabled="managementBusy"
              @click="closeManagement"
            >
              <AppIcon name="close" />
            </button>
          </div>
          <form @submit.prevent="saveManagement">
            <template v-if="managementMode === 'edit'">
              <p class="catalog-help">将同步更新原收件人的消息，保留发送时间和各自已读状态，不会重新群发。</p>
              <fieldset class="notice-fields" :disabled="managementBusy">
                <label class="community-field"
                  >修改通知标题<input v-model.trim="draft.title" required maxlength="160"
                /></label>
                <label class="community-field"
                  >修改通知正文<textarea
                    v-model.trim="draft.content"
                    required
                    maxlength="2000"
                    rows="6"
                  ></textarea>
                </label>
                <label class="community-field"
                  >修改站内跳转链接（选填）<input
                    v-model.trim="draft.link"
                    maxlength="200"
                    placeholder="例如 /awards"
                /></label>
              </fieldset>
            </template>
            <template v-else>
              <h3 class="notice-deletion-title">{{ managedNotice.title }}</h3>
              <p class="catalog-help">
                删除后，这条通知将从所有用户的收件箱和发送列表移除，不再计入未读提醒。操作记录保留用于审计。
              </p>
            </template>
            <p v-if="managementError" class="form-error" role="alert">{{ managementError }}</p>
            <div class="notice-actions">
              <button
                type="button"
                class="button secondary"
                :disabled="managementBusy"
                :autofocus="managementMode === 'delete'"
                @click="closeManagement"
              >
                取消</button
              ><button
                type="submit"
                :class="['button', managementMode === 'delete' ? 'notice-danger' : 'primary']"
                :disabled="managementBusy"
              >
                {{
                  managementBusy ? '正在处理…' : managementMode === 'edit' ? '保存通知修改' : '确认删除通知'
                }}
              </button>
            </div>
          </form>
        </template>
      </dialog>
    </template>
    <p v-if="error && !allowed" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.notices-admin {
  max-width: 65rem;
}
.notice-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.notice-fields {
  padding: 0;
  border: 0;
  min-width: 0;
  margin: 1.5rem 0;
}
.notice-fields textarea {
  min-height: 9rem;
}
.notice-composer h2,
.notice-history h2 {
  margin: 0;
}
.notice-preview {
  padding: 1.3rem;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--bg);
}
.notice-preview h3,
.sent-notice h3 {
  font-size: 1rem;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.notice-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.85rem;
  line-height: 1.9;
}
.notice-meta,
.notice-preview small {
  font-size: 0.7rem;
  color: var(--subtle);
  overflow-wrap: anywhere;
}
.notice-success {
  color: var(--green);
}
.notice-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  flex-wrap: wrap;
  margin-top: 1rem;
}
.sent-notice {
  padding: 1.2rem 0;
  border-bottom: 1px solid var(--line);
}
.sent-notice:last-of-type {
  border-bottom: 0;
}
.notice-record-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1rem;
}
.notice-record-actions .button {
  min-height: 44px;
  font-size: max(14px, 0.7rem);
}
.notice-record-actions .danger-outline {
  color: #b84236;
  border-color: color-mix(in srgb, #b84236 40%, var(--line));
}
.notice-management-dialog {
  box-sizing: border-box;
  width: min(38rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: clamp(20px, 3vw, 32px);
  border-radius: 24px;
}
.notice-management-dialog h2 {
  margin: 0;
  font-size: 1.4rem;
}
.notice-management-dialog .community-field {
  font-size: max(14px, 0.8rem);
}
.notice-management-dialog .community-field :is(input, textarea) {
  font-size: max(16px, 0.8rem);
  border-radius: 16px;
  min-height: 48px;
}
.notice-management-dialog .notice-deletion-title {
  font-size: 1.1rem;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.notice-management-dialog .notice-danger {
  background: #b84236;
  color: #fff;
}
@media (max-width: 600px) {
  .notice-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .notice-actions .button {
    width: 100%;
    justify-content: center;
  }
  .notice-fields input,
  .notice-fields textarea {
    font-size: 16px;
  }
  .notice-record-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .notice-record-actions .button {
    justify-content: center;
  }
}
</style>
