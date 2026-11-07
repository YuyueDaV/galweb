<script setup lang="ts">
const auth = useAuth(),
  { notify, loginOpen } = useForum()
const statusNames: Record<string, string> = {
  published: '已发布',
  hidden: '已隐藏',
  deleted: '已删除',
  active: '正常',
  disabled: '已禁用',
}
const posts = ref<{ id: string; title: string; status: string; pinned?: boolean; featured?: boolean }[]>([]),
  error = ref('')
const allowed = computed(() => auth.user.value && auth.user.value.role !== 'member')
type AdminAsset = {
  id: string
  status: 'active' | 'hidden'
  width: number
  height: number
  createdAt: number
  uploader: string
  ownerStatus: string
}
const replyItems = ref<{ id: string; content: string; status: string; author: string }[]>([]),
  assets = ref<AdminAsset[]>([]),
  assetBusy = ref(''),
  assetApiReady = ref(false),
  assetApiError = ref(''),
  assetChecking = ref(false)
const backendUpdateMessage = '图片管理服务尚未更新，请在宝塔更新代码、构建并重启后端，再重新检查。'
let loadVersion = 0
function assetError(cause: unknown) {
  const message = (cause as Error).message
  if (/Cannot (GET|PATCH|DELETE) \/api\/admin\/(assets|asset-management)/.test(message)) {
    assetApiReady.value = false
    assetApiError.value = backendUpdateMessage
    return backendUpdateMessage
  }
  return message
}
async function load() {
  await auth.initialize()
  const version = ++loadVersion,
    viewer = auth.user.value?.id
  assetApiReady.value = false
  assetApiError.value = ''
  error.value = ''
  if (!allowed.value) {
    assets.value = []
    posts.value = []
    replyItems.value = []
    return
  }
  assetChecking.value = true
  try {
    const [postData, replyData, assetData, capabilities] = await Promise.all([
      auth.request<typeof posts.value>('/admin/posts'),
      auth.request<typeof replyItems.value>('/admin/replies'),
      auth.request<AdminAsset[]>('/admin/assets'),
      auth
        .request<{ version: number; preview: boolean; moderation: boolean; deletion: boolean }>(
          '/admin/asset-management',
        )
        .then((value) => ({ value, error: '' }))
        .catch((cause) => ({ value: null, error: (cause as Error).message })),
    ])
    if (version !== loadVersion || viewer !== auth.user.value?.id || !allowed.value) return
    posts.value = postData
    replyItems.value = replyData
    assets.value = assetData
    assetApiReady.value =
      !!capabilities.value &&
      capabilities.value.version >= 2 &&
      capabilities.value.preview &&
      capabilities.value.moderation &&
      capabilities.value.deletion
    if (!assetApiReady.value)
      assetApiError.value = capabilities.error
        ? assetError(new Error(capabilities.error))
        : backendUpdateMessage
  } catch (e) {
    if (version === loadVersion) error.value = (e as Error).message
  } finally {
    if (version === loadVersion) assetChecking.value = false
  }
}
async function editPost(id: string, patch: Record<string, unknown>) {
  try {
    await auth.request('/posts/' + id, patch, 'PATCH')
    await load()
    notify('内容状态已更新。')
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function moderateAsset(asset: AdminAsset) {
  if (assetBusy.value || !assetApiReady.value || !allowed.value) return
  const viewer = auth.user.value?.id,
    status = asset.status === 'active' ? 'hidden' : 'active'
  assetBusy.value = asset.id
  error.value = ''
  try {
    const result = await auth.request<{ message: string }>('/admin/assets/' + asset.id, { status }, 'PATCH')
    if (viewer !== auth.user.value?.id) return
    asset.status = status
    notify(result.message)
  } catch (e) {
    if (viewer === auth.user.value?.id) {
      error.value = assetError(e)
      notify('图片操作失败：' + error.value)
    }
  } finally {
    assetBusy.value = ''
  }
}
async function removeAsset(asset: AdminAsset) {
  if (assetBusy.value || !assetApiReady.value || !allowed.value) return
  if (
    !window.confirm(
      '永久删除这张图片？\n\n图片文件和上传记录将被移除，使用它的头像会恢复默认，帖子或相册将无法继续显示这张图片。此操作无法撤销。',
    )
  )
    return
  const viewer = auth.user.value?.id
  assetBusy.value = asset.id
  error.value = ''
  try {
    const result = await auth.request<{ message: string }>(
      '/admin/assets/' + asset.id + '/permanent',
      { confirmation: '永久删除' },
      'DELETE',
    )
    if (viewer !== auth.user.value?.id) return
    assets.value = assets.value.filter((item) => item.id !== asset.id)
    if (auth.user.value?.avatarAssetId === asset.id) await auth.refresh()
    notify(result.message)
  } catch (e) {
    if (viewer === auth.user.value?.id) {
      error.value = assetError(e)
      notify('删除图片失败：' + error.value)
    }
  } finally {
    assetBusy.value = ''
  }
}
function uploadedAt(value: number) {
  return new Date(Number(value)).toLocaleString('zh-CN')
}
async function moderateReply(id: string, status: string) {
  try {
    await auth.request('/admin/replies/' + id, { status }, 'PATCH')
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}
onMounted(load)
watch(() => auth.user.value?.id, load)
onBeforeUnmount(() => {
  ++loadVersion
})
</script>
<template>
  <div class="award-admin-page">
    <h1>社区管理</h1>
    <template v-if="allowed"
      ><p class="award-field-help">内容管理操作会记录操作日志。</p>
      <div class="admin-page-links">
        <NuxtLink to="/admin/site" class="button secondary">站点配置</NuxtLink
        ><NuxtLink to="/admin/community" class="button secondary">动态与相册</NuxtLink
        ><NuxtLink to="/admin/awards" class="button secondary">十二橙器活动管理</NuxtLink
        ><NuxtLink to="/admin/accounts" class="button secondary">账号权限</NuxtLink>
      </div>
      <section class="award-admin-card">
        <h2>帖子管理</h2>
        <article v-for="post in posts" :key="post.id" class="admin-content-row">
          <NuxtLink :to="'/post/' + post.id">{{ post.title }}</NuxtLink
          ><span>{{ statusNames[post.status] }}</span
          ><button
            @click="editPost(post.id, { status: post.status === 'published' ? 'hidden' : 'published' })"
          >
            {{ post.status === 'published' ? '隐藏' : '恢复' }}</button
          ><button @click="editPost(post.id, { pinned: !post.pinned })">
            {{ post.pinned ? '取消置顶' : '置顶' }}</button
          ><button @click="editPost(post.id, { featured: !post.featured })">
            {{ post.featured ? '取消精选' : '精选' }}
          </button>
        </article>
      </section>
      <section class="award-admin-card">
        <h2>回复管理</h2>
        <article v-for="item in replyItems" :key="item.id" class="admin-content-row">
          <span>{{ item.author }}</span>
          <p>{{ item.content }}</p>
          <button @click="moderateReply(item.id, item.status === 'published' ? 'hidden' : 'published')">
            {{ item.status === 'published' ? '隐藏' : '恢复' }}
          </button>
        </article>
      </section>
      <section class="award-admin-card" aria-labelledby="uploaded-images-heading">
        <h2 id="uploaded-images-heading">上传图片</h2>
        <p class="award-field-help">
          展示上传记录，包含头像及帖子配图。隐藏后可恢复；永久删除会移除文件及记录，无法恢复。
        </p>
        <p v-if="assetChecking" class="award-field-help" role="status">正在检查图片管理服务…</p>
        <div v-else-if="assetApiError" class="admin-asset-service-error">
          <p class="form-error" role="alert">{{ assetApiError }}</p>
          <button class="button secondary" :disabled="!!assetBusy" @click="load">重新检查图片服务</button>
        </div>
        <article
          v-for="asset in assets"
          :key="asset.id"
          class="admin-content-row admin-asset-row"
          :data-asset-id="asset.id"
          :aria-busy="assetBusy === asset.id"
        >
          <SafeImage
            v-if="assetApiReady || asset.status === 'active'"
            :key="asset.id + asset.status + assetApiReady"
            class="admin-asset-preview"
            :src="assetApiReady ? '/api/admin/assets/' + asset.id : '/api/assets/' + asset.id"
            :alt="asset.status === 'hidden' ? '已隐藏图片的管理员预览' : '上传图片预览'"
            width="80"
            height="80"
          />
          <span v-else class="admin-asset-preview admin-asset-unavailable">隐藏图片<br />等待服务更新</span>
          <div class="admin-asset-info">
            <span>{{ asset.width }} × {{ asset.height }} · {{ statusNames[asset.status] }}</span
            ><small>{{ asset.uploader || '未知上传者' }} · {{ uploadedAt(asset.createdAt) }}</small
            ><small v-if="asset.ownerStatus === 'deleted'">上传者已注销，图片不能恢复。</small>
          </div>
          <button
            class="button secondary"
            :disabled="!assetApiReady || !!assetBusy || asset.ownerStatus === 'deleted'"
            @click="moderateAsset(asset)"
          >
            {{ assetBusy === asset.id ? '处理中…' : asset.status === 'active' ? '隐藏图片' : '恢复图片' }}
          </button>
          <button
            class="button secondary admin-asset-delete"
            :disabled="!assetApiReady || !!assetBusy"
            @click="removeAsset(asset)"
          >
            永久删除
          </button>
        </article>
      </section></template
    >
    <div v-else class="empty-state">
      <p>需要管理员账号。</p>
      <button class="button primary" @click="loginOpen = true">登录</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
h1,
h2 {
  font-family: var(--serif);
  margin: 1rem 0;
}
.award-admin-card {
  margin-top: 1rem;
}
.admin-page-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.admin-content-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
  padding: 0.8rem 0;
  border-bottom: 1px solid var(--line);
  font-size: 0.75rem;
}
.admin-content-row > a,
.admin-content-row > strong {
  flex: 1;
  min-width: 10rem;
}
.admin-content-row > button {
  color: var(--orange);
  font-size: 0.65rem;
}
.admin-content-row > span {
  color: var(--subtle);
  font-size: 0.65rem;
}
.admin-asset-preview {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 0.4rem;
  flex-shrink: 0;
}
.admin-asset-info {
  display: grid;
  gap: 0.35rem;
  flex: 1;
  min-width: 9rem;
  color: var(--subtle);
}
.admin-asset-info small {
  font-size: 0.625rem;
  line-height: 1.6;
}
.admin-asset-unavailable {
  display: grid;
  place-content: center;
  text-align: center;
  background: var(--bg);
  font-size: 0.625rem;
}
.admin-asset-delete {
  color: #b5432d;
}
.admin-asset-service-error {
  margin-top: 0.75rem;
}
</style>
