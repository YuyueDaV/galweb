<script setup lang="ts">
import type { AccountRole, PreviewAccount } from '~/types/awards'
import { hasAwardPermission, permissionLabels, roleNames } from '~/utils/awards'

const auth = useAuth()
const identity = usePreviewIdentity()
const { loginOpen, notify } = useForum()
const accounts = ref<PreviewAccount[]>([])
const roleDrafts = reactive<Record<string, AccountRole>>({})
const loading = ref(true)
const pendingId = ref('')
const error = ref('')
const allowed = computed(() => identity.can('account.view'))
const matrixRoles: AccountRole[] = ['member', 'admin', 'super_admin']
const statusNames = { active: '正常', disabled: '已禁用', deleted: '已注销' }
let requestVersion = 0

useSeoMeta({ title: '账号权限 · 澄之响' })

async function loadAccounts() {
  if (!allowed.value) return
  const version = ++requestVersion
  const viewerId = identity.selectedId.value
  loading.value = true
  error.value = ''
  try {
    const data = await auth.request<PreviewAccount[]>('/admin/users')
    if (version !== requestVersion || viewerId !== identity.selectedId.value || !allowed.value) return
    accounts.value = data
    for (const item of data) roleDrafts[item.id] = item.role
  } catch (cause) {
    if (version === requestVersion) error.value = (cause as Error).message
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function updateAccount(id: string, patch: { role?: AccountRole; status?: 'active' | 'disabled' }) {
  if (pendingId.value || !allowed.value) return
  if (patch.role !== undefined && !identity.can('account.manage')) return
  if (patch.status !== undefined && !identity.can('account.status')) return
  const target = accounts.value.find(item => item.id === id)
  if (target?.isLastSuperAdmin && ((patch.role !== undefined && patch.role !== 'super_admin') || patch.status === 'disabled')) {
    error.value = '这是最后一位有效超级管理员，请先将另一账号提升为超级管理员。'
    return
  }
  pendingId.value = id
  error.value = ''
  try {
    await auth.request(`/admin/users/${id}`, patch, 'PATCH')
    if (id === identity.selectedId.value) {
      await auth.refresh()
      notify('账号权限已更新，请重新登录。')
      loginOpen.value = true
    } else {
      await loadAccounts()
      notify(patch.role ? '账号角色已更新，受影响账号需重新登录。' : patch.status === 'disabled' ? '账号已禁用，现有登录会话已撤销。' : '账号已启用。')
    }
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    pendingId.value = ''
  }
}

watch([auth.ready, identity.selectedId, identity.role], () => {
  ++requestVersion
  accounts.value = []
  error.value = ''
  for (const id of Object.keys(roleDrafts)) delete roleDrafts[id]
  if (!auth.ready.value) { loading.value = true; return }
  if (allowed.value) void loadAccounts()
  else loading.value = false
}, { immediate: true })
onMounted(() => auth.initialize())
onBeforeUnmount(() => { ++requestVersion })
</script>

<template>
  <div v-if="!auth.ready.value" class="award-access-denied" role="status">正在确认账号权限…</div>
  <div v-else-if="!allowed" class="award-access-denied">
    <AppIcon name="users" :size="34" />
    <p class="eyebrow">ACCOUNT PERMISSIONS</p>
    <h1>这里需要管理员身份。</h1>
    <p>管理员可查看账号及管理启停状态，角色分配由超级管理员负责。</p>
    <button v-if="!auth.user.value" class="button primary" @click="loginOpen = true">登录账号<AppIcon name="login" :size="17" /></button>
    <NuxtLink :to="identity.can('campaign.manage') ? '/admin/awards' : '/'" class="text-link">{{ identity.can('campaign.manage') ? '前往活动管理' : '回到社区首页' }}<AppIcon name="arrowRight" :size="15" /></NuxtLink>
  </div>
  <div v-else class="award-admin-page account-permissions-page">
    <div class="award-page-top">
      <p class="page-kicker"><AppIcon name="users" :size="15" /> COMMUNITY / ACCOUNT PERMISSIONS</p>
      <NuxtLink to="/admin/awards" class="text-link">前往活动管理<AppIcon name="arrowUpRight" :size="15" /></NuxtLink>
    </div>
    <header class="award-admin-heading">
      <div><p class="eyebrow">让每一份信任，各有职责。</p><h1>账号权限<span>。</span></h1><p>{{ identity.account.value.name }}<span class="award-admin-role">{{ roleNames[identity.role.value] }}</span></p></div>
      <button class="button secondary" :disabled="loading || !!pendingId" @click="loadAccounts"><AppIcon name="users" :size="16" />刷新账号</button>
    </header>
    <div class="award-prototype-notice"><AppIcon name="info" :size="15" /><span>有其他有效超级管理员时可以自行降级；最后一位有效超管不能降级或禁用。角色或状态变更后，受影响账号需重新登录。</span></div>
    <p v-if="error" class="award-admin-error" role="alert"><AppIcon name="info" :size="16" />{{ error }}</p>

    <section class="award-admin-card" aria-labelledby="account-list-heading" :aria-busy="loading">
      <div class="award-admin-card-heading"><div><h2 id="account-list-heading">账号与角色</h2><p>管理员可启停账号，只有超级管理员可以分配角色。</p></div><span class="award-admin-role">角色分配仅限超级管理员</span></div>
      <div v-if="loading" class="empty-state" role="status">正在加载账号…</div>
      <div v-else-if="!accounts.length" class="empty-state"><p>{{ error ? '账号列表加载失败，请点击“刷新账号”重试。' : '暂无账号。' }}</p></div>
      <div v-else class="award-account-list">
        <article v-for="item in accounts" :key="item.id" :aria-busy="pendingId === item.id">
          <div>
            <UserAvatar class="post-avatar orange" :src="item.avatarUrl" :name="item.name" />
            <div><strong>{{ item.name }}<small v-if="item.id === identity.selectedId.value">当前账号</small></strong><span>{{ item.username || '已注销，无法恢复' }}</span><span :class="['account-status', item.status]">{{ statusNames[item.status] }}</span></div>
          </div>
          <div class="account-actions">
            <template v-if="identity.can('account.manage')">
              <select v-model="roleDrafts[item.id]" :disabled="item.status === 'deleted' || item.isLastSuperAdmin || !!pendingId" :aria-label="`${item.name}的角色`"><option v-for="role in matrixRoles" :key="role" :value="role">{{ roleNames[role] }}</option></select>
              <button class="button secondary" :disabled="item.status === 'deleted' || item.isLastSuperAdmin || !!pendingId || roleDrafts[item.id] === item.role" :aria-label="`保存${item.name}的角色`" @click="updateAccount(item.id, { role: roleDrafts[item.id] })">保存角色</button>
            </template>
            <span v-else class="account-role-label">{{ roleNames[item.role] }}</span>
            <button v-if="identity.can('account.status') && item.status !== 'deleted'" class="button secondary" :disabled="!!pendingId || item.isLastSuperAdmin" :aria-label="`${item.status === 'active' ? '禁用' : '启用'}账号${item.username || item.name}`" @click="updateAccount(item.id, { status: item.status === 'active' ? 'disabled' : 'active' })">{{ item.status === 'active' ? '禁用账号' : '启用账号' }}</button>
            <small v-if="item.isLastSuperAdmin" class="account-role-help">最后一位有效超管；先提升另一账号，才能降级或禁用。</small>
          </div>
        </article>
      </div>
    </section>

    <section class="award-admin-card" aria-labelledby="permission-matrix-heading">
      <div class="award-admin-card-heading"><div><h2 id="permission-matrix-heading">角色权限边界</h2><p>普通成员、管理员与超级管理员的职责。</p></div></div>
      <div class="award-permission-table-wrap"><table class="award-permission-table" aria-labelledby="permission-matrix-heading"><thead><tr><th scope="col">权限</th><th v-for="role in matrixRoles" :key="role" scope="col">{{ roleNames[role] }}</th></tr></thead><tbody><tr v-for="(label, permission) in permissionLabels" :key="permission"><th scope="row">{{ label }}</th><td v-for="role in matrixRoles" :key="role"><span v-if="hasAwardPermission(role, permission)" aria-label="允许"><AppIcon name="check" :size="17" /></span><span v-else aria-label="不允许">—</span></td></tr></tbody></table></div>
      <p class="award-small-note">管理员拥有除分配角色之外的全部管理权限，所有变更均记录操作日志。</p>
    </section>
  </div>
</template>

<style scoped>
.account-permissions-page > .award-admin-card + .award-admin-card { margin-top: 1.25rem; }
.award-account-list .account-actions { flex-wrap: wrap; }
.account-role-label { font-size: .6875rem; color: var(--subtle); }
.account-role-help { flex-basis: 100%; font-size: .625rem; color: var(--subtle); line-height: 1.6; }
.award-account-list .account-status { display: inline-block; margin-top: .35rem; padding: .15rem .45rem; border-radius: .25rem; background: var(--bg); color: var(--subtle); }
.award-account-list .account-status.active { color: #657c4f; background: #eaf0e0; }
.award-account-list .account-status.disabled { color: var(--orange); background: var(--hero); }
.award-permission-table tbody th { background: transparent; font-size: inherit; color: var(--subtle); }
.award-permission-table tbody tr:last-child th { border-bottom: 0; }
</style>
